import { randomUUID } from 'node:crypto';

const migration = `CREATE TABLE IF NOT EXISTS hrg_test_runs (
  id text PRIMARY KEY, state jsonb NOT NULL, version integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '2 hours')
)`;
const awardMigration = `CREATE TABLE IF NOT EXISTS hrg_test_awards (
  run_id text NOT NULL REFERENCES hrg_test_runs(id) ON DELETE CASCADE,
  task_id text NOT NULL, team_id text NOT NULL, PRIMARY KEY(run_id,task_id)
)`;

async function saveAwards(connection, id, awards, previous = {}, live = false) {
  const table = live ? 'hrg_game_awards' : 'hrg_test_awards';
  for (const [taskId, award] of Object.entries(awards ?? {})) {
    if (previous[taskId]?.teamId === award.teamId) continue;
    await connection.query(`INSERT INTO ${table}(run_id,task_id,team_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [id, taskId, award.teamId]);
    const result = await connection.query(`SELECT team_id FROM ${table} WHERE run_id=$1 AND task_id=$2`, [id, taskId]);
    if (result.rows[0].team_id !== award.teamId) throw Object.assign(new Error('数据库任务归属唯一约束冲突'), { statusCode: 409 });
  }
}

function storeAdapter(connect, close, driver) {
  return {
    driver,
    async initialize() {
      const connection = await connect();
      try {
        await connection.query(migration); await connection.query(awardMigration);
        await connection.query('CREATE TABLE IF NOT EXISTS hrg_games(id text PRIMARY KEY,state jsonb NOT NULL,version integer NOT NULL DEFAULT 0)');
        await connection.query(awardMigration.replaceAll('hrg_test_awards', 'hrg_game_awards').replaceAll('hrg_test_runs', 'hrg_games'));
        // 重启后持久化位置保留，但不能将旧位置误标成在线。
        await connection.query(`UPDATE hrg_test_runs SET state=jsonb_set(state,'{locations}',COALESCE((SELECT jsonb_object_agg(key,value || '{"restored":true}'::jsonb) FROM jsonb_each(state->'locations')),'{}'::jsonb))`);
        await connection.query(`UPDATE hrg_games SET state=jsonb_set(state,'{locations}',COALESCE((SELECT jsonb_object_agg(key,value || '{"restored":true}'::jsonb) FROM jsonb_each(state->'locations')),'{}'::jsonb))`);
      } finally { connection.release(); }
    },
    async health() { const connection = await connect(); try { await connection.query('SELECT 1'); return driver; } finally { connection.release(); } },
    async gamesDueAbilityWave(intervalMs) {
      const connection = await connect();
      // 只在到达发卡边界时写赛局，避免每秒重写包含媒体原件的整份 JSON。
      try { return (await connection.query(`SELECT id FROM hrg_games
        WHERE state->>'status'='RUNNING'
        AND COALESCE((state->>'lastAbilityPeriodicWave')::bigint,0) < FLOOR(
          (COALESCE((state->>'elapsedMs')::bigint,0) + $1::bigint - COALESCE((state->>'runningSince')::bigint,$1::bigint)) / $2::numeric)
        AND (state->'abilityCatalog' IS NULL OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(state->'abilityCatalog') card WHERE card->>'enabled'='true'))`, [Date.now(), intervalMs])).rows.map(row => row.id); }
      finally { connection.release(); }
    },
    async create(state, live = false) {
      const table = live ? 'hrg_games' : 'hrg_test_runs';
      const connection = await connect();
      try {
        await connection.query('DELETE FROM hrg_test_runs WHERE expires_at < CURRENT_TIMESTAMP');
        const id = randomUUID();
        await connection.query('BEGIN');
        await connection.query(`INSERT INTO ${table}(id,state) VALUES ($1,$2::jsonb)`, [id, JSON.stringify(state)]);
        await saveAwards(connection, id, state.awards, {}, live);
        await connection.query('COMMIT');
        return id;
      } catch (error) { await connection.query('ROLLBACK'); throw error; } finally { connection.release(); }
    },
    async read(id, live = false) {
      const table = live ? 'hrg_games' : 'hrg_test_runs';
      const connection = await connect();
      try { const result = await connection.query(`SELECT state FROM ${table} WHERE id=$1${live ? '' : ' AND expires_at>CURRENT_TIMESTAMP'}`, [id]); return result.rows[0]?.state ?? null; }
      finally { connection.release(); }
    },
    async update(id, apply, live = false) {
      const table = live ? 'hrg_games' : 'hrg_test_runs';
      const connection = await connect();
      try {
        await connection.query('BEGIN');
        const result = await connection.query(`SELECT state FROM ${table} WHERE id=$1${live ? '' : ' AND expires_at>CURRENT_TIMESTAMP'} FOR UPDATE`, [id]);
        if (!result.rows.length) { const error = new Error('测试赛局不存在或已过期'); error.statusCode = 404; throw error; }
        const state = result.rows[0].state;
        const previousAwards = structuredClone(state.awards ?? {});
        const response = await apply(state);
        await saveAwards(connection, id, state.awards, previousAwards, live);
        await connection.query(`UPDATE ${table} SET state=$2::jsonb,version=version+1 WHERE id=$1`, [id, JSON.stringify(state)]);
        await connection.query('COMMIT');
        return response;
      } catch (error) { await connection.query('ROLLBACK'); throw error; }
      finally { connection.release(); }
    },
    async remove(id) { const connection = await connect(); try { await connection.query('DELETE FROM hrg_test_runs WHERE id=$1', [id]); } finally { connection.release(); } },
    close
  };
}

export async function createPostgresStore(connectionString) {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString, max: 12, connectionTimeoutMillis: 10000 });
  const store = storeAdapter(async () => { const connection = await pool.connect(); return { query: connection.query.bind(connection), release: () => connection.release() }; }, () => pool.end(), 'postgresql');
  await store.initialize(); return store;
}

// 本机验证用真实 PostgreSQL WASM 引擎；服务器仅使用上面的 PostgreSQL 连接。
export async function createLocalStore(directory) {
  const { PGlite } = await import('@electric-sql/pglite');
  const database = new PGlite(directory);
  let tail = Promise.resolve();
  const store = storeAdapter(async () => {
    const previous = tail; let release;
    tail = new Promise(resolve => { release = resolve; }); await previous;
    return { query: database.query.bind(database), release };
  }, () => database.close(), 'pglite-local-verification');
  await store.initialize(); return store;
}
