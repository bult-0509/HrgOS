import { validateTestApiBase } from './ruleSuite.ts';
import type { RuleResult, SuiteOptions } from './ruleSuite';

/** 与前端一键测试共用：虚拟比赛时钟不影响正式比赛。 */
export async function runPeriodicCardGrantCheck(options: SuiteOptions): Promise<RuleResult> {
  const base = validateTestApiBase(options.baseUrl), started = performance.now(); let id = '';
  const ensure = (value: unknown, message: string) => { if (!value) throw new Error(message); };
  const request = async (path: string, token: string, body?: unknown, expected = 200) => {
    options.signal?.throwIfAborted();
    const response = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: body ? JSON.stringify(body) : undefined, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000), cache: 'no-store' });
    const data = await response.json(); ensure(response.status === expected, `HTTP ${response.status}：${data.code ?? data.message}`); return data;
  };
  let result: RuleResult;
  try {
    const fixture = await request('/testing/runs', options.key, { teamCount: 5 }, 201); id = fixture.id;
    const path = `/testing/runs/${id}`, tokens: Record<string, string> = {}, accounts: Record<string, string> = {};
    for (const role of ['host', 'player', 'member', 'opponent']) { const login = await request(`${path}/login`, '', fixture.credentials[role]); tokens[role] = login.token; accounts[role] = login.accountId; }
    const command = (role: string, body: unknown, expected = 200) => request(`${path}/commands`, tokens[role], body, expected);
    const state = (role = 'host') => request(`${path}/state`, tokens[role]);
    const clock = (milliseconds: number) => request(`${path}/clock`, options.key, { milliseconds });
    await clock(3600000); ensure((await state()).abilityCards.length === 0, '正式开赛前发卡');
    await command('host', { type: 'transition', status: 'RUNNING' });
    await clock(1799999); ensure((await state()).abilityCards.length === 0, '不足30分钟就发卡');
    await command('host', { type: 'transition', status: 'PAUSED' });
    await clock(3600000); ensure((await state()).abilityCards.length === 0, '暂停期间仍计时发卡');
    await command('host', { type: 'transition', status: 'RUNNING' }); await clock(1);
    const first = await state(); ensure(first.abilityCards.length === 5 && first.periodicAbility.distributedRounds === 1, '30分钟未向五队各发一张');
    for (const team of first.teams) ensure(first.abilityCards.filter((card: any) => card.teamId === team.id && card.wave === 1 && card.source === 'periodic').length === 1, '第一轮漏发或重复发卡');
    ensure(first.abilityCards.every((card: any) => card.number >= 1 && card.number <= 24), '随机卡不在24张目录中');
    const shared = (await state('player')).abilityCards[0];
    await command('opponent', { type: 'ability_reveal', instanceId: shared.id }, 403);
    await command('player', { type: 'ability_reveal', instanceId: shared.id }); await command('player', { type: 'ability_reveal', instanceId: shared.id });
    const member = (await state('member')).abilityCards[0];
    ensure(member.id === shared.id && member.status === 'AVAILABLE' && member.revealedBy.length === 1 && member.revealedBy.includes(accounts.player) && !member.revealedBy.includes(accounts.member), '收下动效重复发卡、消耗卡牌或替队友关闭展示');
    const concurrent = await Promise.all(Array.from({ length: 5 }, () => state())); ensure(concurrent.every(view => view.abilityCards.length === 5), '并发刷新重复发卡');
    // 单卡池验证各队独立抽取、允许重复，不依赖随机碰撞概率。
    for (const card of first.abilityCatalog) if (card.number !== 3) await command('host', { type: 'ability_configure', number: card.number, patch: { enabled: false }, reason: '隔离测试随机池' });
    await clock(3600000); const caught = await state();
    ensure(caught.abilityCards.length === 15 && caught.periodicAbility.distributedRounds === 3 && caught.abilityCards.filter((card: any) => card.wave > 1).every((card: any) => card.number === 3), '遗漏轮次未补发或停用卡被抽中');
    await command('host', { type: 'transition', status: 'FINISHED' }); await clock(3600000);
    ensure((await state()).abilityCards.length === 15, '结束后继续发卡');
    result = { id: 'CARDS-PERIODIC-GRANT', title: '开赛后每半小时向全体队伍随机发卡', status: 'passed', detail: '五队验证30分钟边界、暂停冻结、结束停止、补发两轮、停用卡排除、并发不重复，以及成员独立展示与队内共享库存。', durationMs: Math.round(performance.now() - started) };
  } catch (error) {
    options.signal?.throwIfAborted(); result = { id: 'CARDS-PERIODIC-GRANT', title: '开赛后每半小时向全体队伍随机发卡', status: 'failed', detail: error instanceof Error ? error.message : String(error), durationMs: Math.round(performance.now() - started) };
  } finally {
    if (id) { const response = await fetch(`${base}/api/testing/runs/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${options.key}` }, signal: AbortSignal.timeout(10000) }); if (!response.ok) throw new Error('半小时发卡测试赛局清理失败'); }
  }
  return result;
}
