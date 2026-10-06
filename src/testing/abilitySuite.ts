import { validateTestApiBase } from './ruleSuite.ts';
import { runGlobalCardGrantCheck } from './globalCardGrantCheck.ts';
import { runPeriodicCardGrantCheck } from './periodicCardGrantCheck.ts';
import type { RuleResult, SuiteOptions, SuiteReport } from './ruleSuite';

const image = { name: 'ability-proof.png', mime: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGPgkuT6D8IMMAYAJKIEsYXC9Q4AAAAASUVORK5CYII=' };
const titles = ['合照换分', '原地冻结', '排名透视', '微笑朗诵', '榜首援助', '下蹲挑战', '三足限制', '双手许可', '循环唱词', '五字交流', '期末周饮品', '任务重演', '最难曲', '时空回返', '任务交换', '持续接触', '贴地行走', '单手游戏', '隐匿追逐', '昵称拼词', '圆周率接力', '第九章密钥', '无中生有', '爆裂魔法'];
const ensure = (valid: unknown, message: string) => { if (!valid) throw new Error(message); };

/** 与浏览器共用的 24 张卡接口验收。现场行为由测试工作人员显式确认，不冒充实机验证。 */
export async function runAbilitySuite(options: SuiteOptions): Promise<SuiteReport> {
  const base = validateTestApiBase(options.baseUrl); const startedAt = new Date().toISOString(); const results: RuleResult[] = [];
  const publish = (result: RuleResult) => { results.push(result); options.onResult?.(result); };
  const request = async (path: string, token = '', method = 'GET', body?: unknown, expected = 200, key: string = crypto.randomUUID()) => {
    const response = await fetch(`${base}/api${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json', 'Idempotency-Key': key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000), cache: 'no-store' });
    const data = await response.json(); ensure(response.status === expected, `HTTP ${response.status}，预期 ${expected}：${data.code ?? data.message}`); return data;
  };
  const health = await request('/health'); ensure(health.testApiEnabled, '请在隔离环境启用测试 API');
  for (let number = 1; number <= titles.length; number++) {
    if (options.signal?.aborted) throw new DOMException('测试已取消', 'AbortError');
    let fixture: any; const start = performance.now();
    try {
      fixture = await request('/testing/runs', options.key, 'POST', { teamCount: 3 }, 201);
      const prefix = `/testing/runs/${fixture.id}`; const tokens: Record<string, string> = {};
      for (const role of ['host', 'player', 'opponent', 'team3-member1']) tokens[role] = (await request(`${prefix}/login`, '', 'POST', fixture.credentials[role])).token;
      const state = (role = 'player') => request(`${prefix}/state`, tokens[role]);
      const command = (role: string, body: any, expected = 200, key?: string) => request(`${prefix}/commands`, tokens[role], 'POST', body, expected, key);
      const clock = (milliseconds: number) => request(`${prefix}/clock`, options.key, 'POST', { milliseconds });
      const roleFor = (teamId: string) => teamId === 'team-1' ? 'player' : teamId === 'team-2' ? 'opponent' : 'team3-member1';
      const adjust = (teamId: string, points: number) => command('host', { type: 'correct_score', teamId, points, reason: '隔离测试初始分' });
      const submit = async (role: string, kind: string, taskId?: string) => (await command(role, { type: 'submit', kind, taskId, regionId: 'stage-a', media: image })).submission;
      const reviewTask = (id: string, result = 'approve') => command('host', { type: 'review', submissionId: id, result, reason: '隔离测试审核' });
      await command('host', { type: 'transition', status: 'RUNNING' });
      const staff = await state('host'); ensure(staff.abilityCatalog.length === titles.length, '能力卡目录不完整');
      if (number === 1) { await adjust('team-1', 10); await adjust('team-2', 30); }
      if (number === 5) await adjust('team-2', 150);
      if (number === 12) { await reviewTask((await submit('opponent', 'arrival')).id); await reviewTask((await submit('opponent', 'task', 'T01')).id); }
      if (number === 14) { await command('opponent', { type: 'location', foreground: true, latitude: 30, longitude: 120, accuracy: 3, capturedAt: Date.now() }); await clock(600000); await command('opponent', { type: 'location', foreground: true, latitude: 30.01, longitude: 120.01, accuracy: 3, capturedAt: Date.now() }); }
      if (number === 15) for (const role of ['player', 'opponent']) await reviewTask((await submit(role, 'arrival')).id);
      if (number === 23) await command('host', { type: 'ability_reserve_configure', tasks: [{ id: 'EXTRA01', title: '隔离备用挑战', brief: '仅用于测试额外任务的抽取与证据审核', points: 5 }], reason: '隔离测试任务池' });
      await command('player', { type: 'ability_grant', number, teamId: 'team-1', reason: '越权发放' }, 403);
      const card = (await command('host', { type: 'ability_grant', number, teamId: 'team-1', reason: '能力卡接口验收' })).card;
      const use = (await command('player', { type: 'ability_use', instanceId: card.id, targetTeamId: 'team-2' })).use;
      await command('player', { type: 'ability_use', instanceId: card.id, targetTeamId: 'team-2' }, 409);
      if (![3, 8].includes(number)) { await command('player', { type: 'ability_confirm', useId: use.id, result: 'approve' }, 403); const key = crypto.randomUUID(); await command('host', { type: 'ability_confirm', useId: use.id, result: 'approve' }, 200, key); await command('host', { type: 'ability_confirm', useId: use.id, result: 'approve' }, 200, key); }
      if (![3, 5, 8].includes(number)) {
        if (number === 2) await command('opponent', { type: 'location', foreground: true, latitude: 30, longitude: 120, accuracy: 3, capturedAt: Date.now() });
        for (const teamId of use.targets) await command(roleFor(teamId), { type: 'ability_ack', useId: use.id });
      }
      const settle = (teamId: string, result = 'approve', extra: Record<string, unknown> = {}, expected = 200) => command('host', { type: 'ability_review', useId: use.id, teamId, result, reason: '隔离测试工作人员确认；现场行为另行实机验收', ...extra }, expected);
      const proof = (role: string, text = '隔离测试的现场完成证据', extra: Record<string, unknown> = {}) => command(role, { type: 'ability_submit', useId: use.id, text, media: image, ...extra });
      if (number === 1) { await proof('player'); await settle('team-2'); ensure((await state()).team.score === 30 && (await state('opponent')).team.score === 10, '双方积分未交换'); }
      else if (number === 2) { await clock(3000); await command('opponent', { type: 'location', foreground: true, latitude: 30.01, longitude: 120, accuracy: 3, capturedAt: Date.now() }); ensure((await state('host')).abilityUses[0].movementAlerts.length, '冻结位移未提醒'); await settle('team-2', 'reject'); ensure((await state('opponent')).team.score === -5, '默认违规扣分不符'); }
      else if (number === 3) { ensure((await state()).liveRanking.length === 3 && (await state()).liveRanking.every((team: any) => team.rank === 1), '全部队伍排名或并列名次错误'); await clock(600000); ensure((await state()).liveRanking === null, '十分钟到期未撤销排名权限'); await request(`${prefix}/scores/team-2`, tokens.player, 'GET', undefined, 403); }
      else if (number === 5) ensure((await state()).team.score === 100 && (await state('opponent')).team.score === 50, '榜首转分未结算为100/50');
      else if (number === 6) { await proof('opponent'); const members = staff.roster.filter((member: any) => member.teamId === 'team-2'); const counts = Object.fromEntries(members.map((member: any, i: number) => [member.id, i ? 20 : 18])); await settle('team-2', 'approve', { counts }); ensure((await state('opponent')).team.score === -50, '缺少两个下蹲应扣50分'); }
      else if (number === 8) { ensure((await state()).taskPermissions.twoHands, '双手许可未生效'); await reviewTask((await submit('player', 'arrival')).id); const rejected = await submit('player', 'task', 'T01'); await reviewTask(rejected.id, 'reject'); ensure((await state()).taskPermissions.twoHands, '打回任务消耗了双手许可'); await reviewTask((await submit('player', 'task', 'T01')).id); ensure(!(await state()).taskPermissions.twoHands, '任务审核通过后未消耗许可'); }
      else if (number === 12) { await proof('opponent'); await settle('team-2'); ensure((await state('opponent')).team.score === 7.5, '重演未单独奖励2.5分'); }
      else if (number === 14) { const target = await state('opponent'); ensure(target.abilityUses[0].returnPosition.latitude === 30, '没有使用十分钟前的真实位置'); await proof('opponent'); await settle('team-2'); ensure((await state('opponent')).location.latitude === 30.01, '回返卡伪造了当前GPS'); }
      else if (number === 15) { await command('opponent', { type: 'ability_swap', useId: use.id, peerTeamId: 'team-1', ownTaskId: 'T01', peerTaskId: 'T02' }); ensure((await state()).activeAssignment.taskId === 'T01' && (await state('opponent')).activeAssignment.taskId === 'T02', '下一任务未交换'); await command('player', { type: 'submit', kind: 'task', regionId: 'stage-a', taskId: 'T03', media: image }, 409); }
      else if (number === 19) { await command('player', { type: 'location', foreground: true, latitude: 30, longitude: 120, accuracy: 3, capturedAt: Date.now() }); ensure((await state('opponent')).huntLocations[0].latitude === 30, '追逐位置未公开'); await clock(900000); ensure((await state('opponent')).huntLocations.length === 0, '到期仍公开追逐位置'); await settle('team-1'); ensure((await state()).team.score === 5, '隐匿成功未加五分'); }
      else if (number === 20) { const target = use.targets[0]; const members = staff.roster.filter((member: any) => member.teamId === target); ensure(members.length === 3, '测试队伍应有三位成员'); await proof(roleFor(target), '三位昵称现场拼出 hrg', { participants: members.map((member: any) => member.id) }); await settle(target); ensure((await state(roleFor(target))).team.score === 5, '昵称拼词奖励未到账'); }
      else if (number === 21) { for (let i = 0; i < use.targets.length; i++) { await proof(roleFor(use.targets[i]), '三人圆周率接力，现场核对'); await settle(use.targets[i], 'approve', { verifiedDigits: i + 10 }); ensure((await state(roleFor(use.targets[i]))).team.score === i + 10, '圆周率小数位积分不符'); } }
      else if (number === 22) { for (const target of use.targets) { await command(roleFor(target), { type: 'ability_submit', useId: use.id, text: fixture.abilityAnswer.toUpperCase().replace('-', '， — ') }); await clock(1); } await command('host', { type: 'ability_settle', useId: use.id, reason: '服务器正确答案顺序结算' }); ensure((await state()).team.score === 5 && (await state('team3-member1')).team.score === -5 && (await state('opponent')).team.score === 0, '最快/中间/最慢计分不符'); }
      else if (number === 23) { const target = await state('opponent'); ensure(target.activeAssignment.kind === 'extra' && target.activeAssignment.taskId === target.abilityUses[0].extraTask.id && !target.tasks.some((task: any) => task.id === target.activeAssignment.taskId), '没有抽出棋盘之外的额外任务'); await command('opponent', { type: 'submit', kind: 'arrival', regionId: 'stage-a', media: image }, 409); await proof('opponent'); await settle('team-2'); ensure((await state('opponent')).activeAssignment === null && (await state('opponent')).team.score === 0, '额外任务审核没有解除分配或产生额外加分'); }
      else {
        if ([7, 9, 10, 16, 17, 18, 24].includes(number)) { if (number === 24) { ensure((await state('opponent')).taskPermissions.phoneTextOnly, '五分钟手机打字限制未生效'); await settle('team-2', 'approve', {}, 409); } if (number === 18) ensure((await state('opponent')).taskPermissions.oneHandOnly, '单手操作标记未生效'); await clock(use.definition.durationMs); }
        else await proof('opponent');
        const fail = [4, 9, 13].includes(number);
        for (const target of use.targets) { await settle(target, fail ? 'reject' : 'approve'); ensure((await state(roleFor(target))).team.score === (fail ? -use.definition.penalty : 0), '行为卡结算分数不符'); }
      }
      const finalView = await state('host'); const settled = finalView.abilityUses.find((item: any) => item.id === use.id);
      if (number !== 8 && number !== 15) ensure(settled.status === 'DONE', '卡牌没有完成闭环');
      ensure(finalView.abilityCards.find((item: any) => item.id === card.id).status === 'USED', '卡牌库存未消耗');
      publish({ id: `CARD-${String(number).padStart(2, '0')}`, title: `${number}. ${titles[number - 1]}`, status: 'passed', detail: '真实 HTTP + 数据库已验证权限、消费和规则结算；照片/动作/朗诵真实性由工作人员现场确认。', durationMs: Math.round(performance.now() - start) });
    } catch (error) { if (options.signal?.aborted) throw error; publish({ id: `CARD-${String(number).padStart(2, '0')}`, title: `${number}. ${titles[number - 1]}`, status: 'failed', detail: error instanceof Error ? error.message : String(error), durationMs: Math.round(performance.now() - start) }); }
    finally { if (fixture?.id) { try { const response = await fetch(`${base}/api/testing/runs/${fixture.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${options.key}` }, signal: AbortSignal.timeout(10000) }); if (!response.ok) publish({ id: 'CLEANUP', title: '清理隔离赛局', status: 'failed', detail: `HTTP ${response.status}`, durationMs: 0 }); } catch (error) { publish({ id: 'CLEANUP', title: '清理隔离赛局', status: 'failed', detail: String(error), durationMs: 0 }); } } }
  }
  publish(await runGlobalCardGrantCheck(options));
  publish(await runPeriodicCardGrantCheck(options));
  publish({ id: 'CARDS-MANUAL', title: '现场与异地部署验收', status: 'manual', detail: '需三人队伍和真实手机验收动作、昵称拼词、朗诵、合照、歌曲难度、饮品及真实返回；异地 PostgreSQL、GPS、视频可播放性和公网延迟须部署后实测。', durationMs: 0 });
  return { startedAt, finishedAt: new Date().toISOString(), target: base, database: health.database, results, passed: results.filter(item => item.status === 'passed').length, failed: results.filter(item => item.status === 'failed').length, manual: results.filter(item => item.status === 'manual').length };
}
