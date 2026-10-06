import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createLocalStore } from './store.mjs';
import { createTestServer } from './app.mjs';
import { createAccounts } from './auth.mjs';
import { seedState } from './rules.mjs';
import { runLiveClockOnce } from './liveClock.mjs';
import { runPeriodicCardGrantCheck } from '../src/testing/periodicCardGrantCheck.ts';

test('半小时全队随机发卡 HTTP 闭环：边界、暂停、补发、并发、展示权限', async () => {
  const store = await createLocalStore(), key = 'periodic-tests-control-key-abcdefghijklmnopqrstuvwxyz';
  const app = await createTestServer({ store, testKey: key, enabled: true });
  try {
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const result = await runPeriodicCardGrantCheck({ baseUrl: address, key });
    assert.equal(result.status, 'passed', result.detail);
  } finally { await app.close(); await store.close(); }
});

test('正式后台在无人访问时自动发卡，重启、多扫描并发不重复；暂停不补发', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hrgos-periodic-'));
  let store = await createLocalStore(directory), app;
  try {
    const state = seedState(createAccounts(2).accounts);
    state.mode = 'live'; state.virtualTime = null; state.status = 'RUNNING'; state.elapsedMs = 3600000; state.runningSince = Date.now();
    const id = await store.create(state, true);
    app = await createTestServer({ store, gameAdminKey: 'periodic-live-admin-key-abcdefghijklmnopqrstuvwxyz', enabled: false });
    await app.ready();
    // 只读数据库，不请求任何状态接口，不调用 tick。
    let saved;
    for (let attempt = 0; attempt < 30; attempt++) { saved = await store.read(id, true); if (saved.abilityCards?.length === 4) break; await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.equal(saved.abilityCards.length, 4); assert.equal(saved.lastAbilityPeriodicWave, 2);
    const ids = saved.abilityCards.map(card => card.id);
    await Promise.all([runLiveClockOnce(store), runLiveClockOnce(store)]);
    assert.deepEqual((await store.read(id, true)).abilityCards.map(card => card.id), ids);
    await app.close(); app = null; await store.close(); store = await createLocalStore(directory);
    await runLiveClockOnce(store); assert.deepEqual((await store.read(id, true)).abilityCards.map(card => card.id), ids);
    await store.update(id, current => { current.status = 'PAUSED'; current.elapsedMs = 7200000; current.runningSince = null; }, true);
    await runLiveClockOnce(store); assert.equal((await store.read(id, true)).abilityCards.length, 4);
    await store.update(id, current => { current.status = 'RUNNING'; current.runningSince = Date.now(); }, true);
    await runLiveClockOnce(store); const resumed = await store.read(id, true); assert.equal(resumed.abilityCards.length, 8); assert.equal(resumed.lastAbilityPeriodicWave, 4);
    await runLiveClockOnce(store); assert.equal((await store.read(id, true)).abilityCards.length, 8);
  } finally {
    await app?.close(); await store.close();
    if (resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('hrgos-periodic-')) await rm(directory, { recursive: true, force: true });
  }
});
