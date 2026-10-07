import { validateTestApiBase } from './ruleSuite.ts';
import type { RuleResult, SuiteOptions } from './ruleSuite';

const image = { name: 'task-proof.png', mime: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGPgkuT6D8IMMAYAJKIEsYXC9Q4AAAAASUVORK5CYII=' };
const ensure = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

/** 五队真实 HTTP 流程：到达、任务审核、全队发卡、同队并发用卡、第二轮发放。 */
export async function runGlobalCardGrantCheck(options: SuiteOptions): Promise<RuleResult> {
  const base = validateTestApiBase(options.baseUrl); const started = performance.now(); let id = '';
  const request = async (path: string, token: string, body?: unknown, expected = 200, key: string = crypto.randomUUID()) => {
    options.signal?.throwIfAborted();
    const response = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: body ? JSON.stringify(body) : undefined, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000), cache: 'no-store' });
    const data = await response.json(); ensure(response.status === expected, `HTTP ${response.status}：${data.code ?? data.message}`); return data;
  };
  let result: RuleResult;
  try {
    const fixture = await request('/testing/runs', options.key, { teamCount: 5 }, 201); id = fixture.id;
    const path = `/testing/runs/${id}`; const tokens: Record<string, string> = {};
    for (const role of ['host', 'player', 'member', 'opponent', 'team3-member1', 'team4-member1', 'team5-member1']) tokens[role] = (await request(`${path}/login`, '', fixture.credentials[role])).token;
    const command = (role: string, body: unknown, expected = 200, key?: string) => request(`${path}/commands`, tokens[role], body, expected, key);
    const state = (role = 'host') => request(`${path}/state`, tokens[role]);
    const submit = async (role: string, kind: string, taskId?: string) => (await command(role, { type: 'submit', kind, taskId, regionId: 'stage-a', media: image })).submission.id;
    const review = (submissionId: string, result = 'approve', key?: string) => command('host', { type: 'review', submissionId, result, reason: '全体十任务发卡联调', }, 200, key);
    await command('host', { type: 'transition', status: 'RUNNING' });
    for (const card of (await state()).abilityCatalog) if (card.number !== 3) await command('host', { type: 'ability_configure', number: card.number, patch: { enabled: false }, reason: '隔离测试仅启用排名透视，验证共享消费' });
    for (const role of ['player', 'opponent', 'team3-member1', 'team4-member1', 'team5-member1']) await review(await submit(role, 'arrival'));
    ensure((await state()).abilityProgress.completedTasks === 0, '区域到达被错误计为任务');
    for (let number = 1; number <= 9; number++) {
      await review(await submit(number <= 5 ? 'player' : 'opponent', 'task', `T${String(number).padStart(2, '0')}`));
      ensure((await state()).abilityCards.length === 0, '不到10个任务就发卡或仍按单队区域发卡');
    }
    const rejected = await submit('opponent', 'task', 'T01'); await review(rejected, 'reject');
    ensure((await state()).abilityProgress.completedTasks === 9, '打回任务被计入完成数');
    const tenth = await submit('opponent', 'task', 'T01');
    ensure((await state()).abilityProgress.completedTasks === 9, '未审核任务被计入完成数');
    const reviewKey = crypto.randomUUID(); await Promise.all([review(tenth, 'approve', reviewKey), review(tenth, 'approve', reviewKey)]);
    const first = await state(); ensure(first.abilityProgress.completedTasks === 10 && first.abilityProgress.distributedRounds === 1 && first.abilityCards.length === 5, '第10个任务没有给五队各发一张');
    ensure(Object.keys(first.awards).length === 9, '此轮应包含跨队完成同一任务的不计分审核');
    for (const team of first.teams) ensure(first.abilityCards.filter((card: any) => card.teamId === team.id && card.grantRound === 1).length === 1, '某队漏发或重复发卡');
    const shared = (await state('player')).abilityCards[0];
    ensure((await state('member')).abilityCards[0].id === shared.id && (await state('opponent')).abilityCards.every((card: any) => card.id !== shared.id), '队内库存不共享或跨队泄露库存');
    await command('opponent', { type: 'ability_use', instanceId: shared.id }, 409);
    const responses = await Promise.all(['player', 'member'].map(role => fetch(`${base}/api${path}/commands`, { method: 'POST', headers: { Authorization: `Bearer ${tokens[role]}`, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ type: 'ability_use', instanceId: shared.id }), signal: AbortSignal.timeout(20000) })));
    ensure(responses.map(response => response.status).sort().join(',') === '200,409', '同队并发用了同一张卡两次');
    ensure((await state('member')).abilityCards[0].status === 'USED', '队友未看到共享库存消费');
    // 一队已达五项上限，必须出发；在尚有名额的二队验证同队重复审核去重。
    await review(await submit('opponent', 'task', 'T01'));
    ensure((await state()).abilityProgress.completedTasks === 10 && (await state()).abilityCards.length === 5, '同队重复任务导致重复累计或发卡');
    for (let number = 10; number <= 19; number++) await review(await submit(number <= 14 ? 'team3-member1' : 'team4-member1', 'task', `T${String(number).padStart(2, '0')}`));
    const second = await state(); ensure(second.abilityProgress.completedTasks === 20 && second.abilityProgress.distributedRounds === 2 && second.abilityCards.length === 10, '第20个任务没有再次发给每队一张');
    for (const team of second.teams) ensure(second.abilityCards.filter((card: any) => card.teamId === team.id).length === 2, '第二轮每队累计应为两张');
    const repeated = await state(); ensure(repeated.abilityCards.length === 10, '重复读取重复发卡');
    result = { id: 'CARDS-GLOBAL-GRANT', title: '全体每10个任务向各队发卡，队内共享库存', status: 'passed', detail: '五队完成20个审核任务，共发2轮10张卡；到达/打回/待审不计数，同队重复任务不重复累计，跨队同任务各计一次；同队并发用卡仅一次成功。', durationMs: Math.round(performance.now() - started) };
  } catch (error) {
    options.signal?.throwIfAborted(); result = { id: 'CARDS-GLOBAL-GRANT', title: '全体每10个任务向各队发卡，队内共享库存', status: 'failed', detail: error instanceof Error ? error.message : String(error), durationMs: Math.round(performance.now() - started) };
  } finally {
    if (id) { const response = await fetch(`${base}/api/testing/runs/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${options.key}` }, signal: AbortSignal.timeout(10000) }); if (!response.ok) throw new Error('全体发卡测试赛局清理失败'); }
  }
  return result;
}
