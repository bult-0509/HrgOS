export interface RuleResult { id: string; title: string; status: 'passed' | 'failed' | 'manual'; detail: string; durationMs: number }
export interface SuiteOptions { baseUrl: string; key: string; signal?: AbortSignal; onResult?: (result: RuleResult) => void; onBoard?: (tasks: Record<string, any>[]) => void }
export interface SuiteReport { startedAt: string; finishedAt: string; target: string; database: string; results: RuleResult[]; passed: number; failed: number; manual: number }

const image = { name: 'fixture.png', mime: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGPgkuT6D8IMMAYAJKIEsYXC9Q4AAAAASUVORK5CYII=' };
const ensure = (valid: unknown, message: string) => { if (!valid) throw new Error(message); };

export function validateTestApiBase(baseUrl: string) {
  const url = new URL(baseUrl);
  ensure(url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), '异地后端必须使用 HTTPS；HTTP 仅允许 localhost');
  ensure(!url.username && !url.password && !url.search && !url.hash, '后端地址不能包含凭据或查询参数');
  return url.href.replace(/\/$/, '');
}

/** 浏览器与命令行共用；所有业务断言经真实 HTTP / WebSocket 公开接口验证。 */
export async function runRuleSuite(options: SuiteOptions): Promise<SuiteReport> {
  const base = validateTestApiBase(options.baseUrl);
  const startedAt = new Date().toISOString(); const results: RuleResult[] = []; const tokens: Record<string, string> = {};
  let run: Record<string, any> = {}; let database = 'unknown';
  const publish = (result: RuleResult) => { results.push(result); options.onResult?.(result); };
  const step = async (id: string, title: string, action: () => Promise<void>) => {
    if (options.signal?.aborted) throw new DOMException('测试已取消', 'AbortError');
    const start = performance.now();
    try { await action(); publish({ id, title, status: 'passed', detail: '已通过真实接口验证', durationMs: Math.round(performance.now() - start) }); }
    catch (error) { if (options.signal?.aborted) throw error; publish({ id, title, status: 'failed', detail: error instanceof Error ? error.message : '测试失败', durationMs: Math.round(performance.now() - start) }); }
  };
  const request = async (path: string, role = 'player', method = 'GET', data?: unknown, status = 200, idempotencyKey?: string) => {
    const token = role === 'control' ? options.key : tokens[role];
    const response = await fetch(`${base}/api${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) }, body: data !== undefined ? JSON.stringify(data) : undefined, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000), cache: 'no-store' });
    const body = await response.json();
    ensure(response.status === status, `HTTP ${response.status}，预期 ${status}；${body.code ?? '接口响应不符'}`); return body;
  };
  const path = (suffix: string) => { ensure(run?.id, '测试赛局未创建，检查后端或访问密钥'); return `/testing/runs/${run!.id}${suffix}`; };
  const state = (role = 'player') => request(path('/state'), role);
  const command = (role: string, data: unknown, status = 200, key = crypto.randomUUID()) => request(path('/commands'), role, 'POST', data, status, key);
  const advance = (milliseconds: number) => request(path('/clock'), 'control', 'POST', { milliseconds });
  const submit = (role: string, kind: string, taskId?: string, regionId = 'stage-a', key = crypto.randomUUID()) => command(role, { type: 'submit', kind, taskId, regionId, media: image }, 200, key);
  const review = (id: string, result = 'approve', reason = '') => command('host', { type: 'review', submissionId: id, result, reason });
  let arrival: any, resubmission: any, rejectedTask: any, opponentTask: any, lastPosition: any, backup: any;
  try {
    await step('HEALTH', '连接异地 API 与数据库', async () => { const health = await request('/health'); ensure(health.status === 'ok' && health.testApiEnabled, '后端未启用隔离测试接口'); database = health.database; });
    await step('AUTH-KEY', '未授权者不能创建测试赛局', async () => { await request('/testing/runs', 'anonymous', 'POST', {}, 401); });
    await step('FIXTURE', '建立独立赛局和随机测试账号', async () => { run = await request('/testing/runs', 'control', 'POST', {}, 201); });
    await step('AC-01', '个人登录、同队成员与工作人员权限隔离', async () => {
      ensure(run, '测试赛局不可用');
      for (const name of ['player', 'member', 'opponent', 'host', 'reviewer', 'tracker']) tokens[name] = (await request(path('/login'), 'anonymous', 'POST', run!.credentials[name])).token;
      const view = await state(); ensure(view.team.id === 'team-1' && !view.teams && !view.accounts && !view.locations && !view.ledger, '玩家响应泄露其他队伍或后台数据');
      await request(path('/login'), 'anonymous', 'POST', { ...run!.credentials.player, role: 'staff' }, 401);
      await request(path('/login'), 'anonymous', 'POST', { ...run!.credentials.player, password: 'wrong' }, 401);
    });
    await step('TC-05', '玩家不能操作后台或伪造工作人员会话', async () => {
      await command('player', { type: 'transition', status: 'RUNNING' }, 403);
      const original = tokens.player; tokens.forged = original.split('.')[0] + '.forged'; await state('forged').then(() => { throw new Error('伪造 token 被接受'); }, error => { ensure(String(error).includes('HTTP 401'), '伪造会话未被拒绝'); });
      await request(path('/clock'), 'player', 'POST', { milliseconds: 1 }, 401);
    });
    await step('AC-02', '未解锁区域只显示图片，禁止提交任务详情', async () => {
      await command('host', { type: 'transition', status: 'RUNNING' });
      const view = await state(); ensure(view.tasks.length === 25 && view.tasks.every((item: any) => item.image && !item.brief && item.points === undefined), '未解锁时任务详情泄露');
      const response = await command('player', { type: 'submit', kind: 'task', regionId: 'stage-a', taskId: 'T01', media: image }, 409); ensure(response.code === 'REGION_NOT_UNLOCKED', '区域门禁未生效');
      await command('player', { type: 'submit', kind: 'arrival', regionId: 'stage-c', media: image }, 409);
    });
    await step('TC-02', '相同幂等键重试不重复保存照片和队列', async () => {
      const key = crypto.randomUUID(); arrival = await submit('player', 'arrival', undefined, 'stage-a', key);
      const repeated = await submit('player', 'arrival', undefined, 'stage-a', key); ensure(arrival.submission.id === repeated.submission.id && arrival.media.id === repeated.media.id, '重复请求生成了新记录');
      ensure((await state('host')).queue.length === 1, '幂等请求产生重复队列');
      await command('player', { type: 'submit', kind: 'arrival', regionId: 'stage-a', media: { ...image, name: 'changed.png' } }, 409, key);
    });
    await step('TC-03', '拒绝伪装图片、多个文件和路径穿越', async () => {
      for (const media of [{ ...image, base64: 'aGVsbG8=' }, { ...image, name: '../secret.png' }, { ...image, mime: 'image/jpeg' }, [image, image]]) {
        await command('opponent', { type: 'submit', kind: 'arrival', regionId: 'stage-a', media }, 400);
      }
      ensure((await state('host')).queue.length === 1, '无效图片进入了队列');
    });
    await step('AC-04 / AC-08', '图寻打回保留原记录，重交使用新的服务器时间', async () => {
      await command('host', { type: 'review', submissionId: arrival.submission.id, result: 'reject' }, 400);
      await review(arrival.submission.id, 'reject', '需要补充区域入口'); await advance(1);
      resubmission = await submit('player', 'arrival'); ensure(resubmission.submission.id !== arrival.submission.id && resubmission.submission.submittedAt > arrival.submission.submittedAt, '重交未生成新的服务端记录');
      ensure((await state()).submissions.some((item: any) => item.status === 'REJECTED_RESUBMIT'), '旧记录丢失');
      ensure((await request(path('/messages'))).messages.some((item: any) => item.type === 'review' && item.pushEligible && !item.read), '打回通知未记录');
    });
    await step('AC-03', '审核推进本队区域并唯一创建待发事件', async () => {
      const key = crypto.randomUUID(); const reviewCommand = { type: 'review', submissionId: resubmission.submission.id, result: 'approve' };
      await command('host', reviewCommand, 200, key); await command('host', reviewCommand, 200, key);
      const view = await state(); ensure(view.team.regionId === 'stage-a' && view.team.regionVersion === 1 && view.events.length === 1 && view.tasks.every((item: any) => item.brief), '审核事务未原子解锁区域和事件');
      ensure((await state('opponent')).team.regionId === null, '区域推进影响了其他队'); options.onBoard?.(view.tasks);
      const otherArrival = await submit('opponent', 'arrival'); await review(otherArrival.submission.id);
    });
    await step('TC-04', '原图字节与哈希不变，缩略图可读且跨队访问被拒绝', async () => {
      const response = await fetch(`${base}/api${path(`/media/${arrival.media.id}`)}`, { headers: { Authorization: `Bearer ${tokens.player}` }, signal: options.signal ?? AbortSignal.timeout(20000) });
      const bytes = await response.arrayBuffer(); const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(value => value.toString(16).padStart(2, '0')).join('');
      ensure(digest === arrival.media.sha256 && bytes.byteLength === atob(image.base64).length, '原图被修改');
      const thumbnail = await fetch(`${base}/api${path(`/media/${arrival.media.id}?thumbnail=1`)}`, { headers: { Authorization: `Bearer ${tokens.host}` }, signal: options.signal ?? AbortSignal.timeout(20000) }); ensure(thumbnail.status === 200 && thumbnail.headers.get('content-type')?.includes('image/webp') && (await thumbnail.arrayBuffer()).byteLength > 0, '缩略图不可用');
      await request(path(`/media/${arrival.media.id}`), 'opponent', 'GET', undefined, 403); await request(path(`/media/${arrival.media.id}`), 'tracker', 'GET', undefined, 403);
    });
    await step('AC-05', '多队任务提交按服务器接收顺序进入全局 FIFO', async () => {
      rejectedTask = await submit('player', 'task', 'T01'); await advance(1); opponentTask = await submit('opponent', 'task', 'T01');
      const queue = (await state('host')).queue; ensure(queue.length === 2 && queue[0].id === rejectedTask.submission.id, 'FIFO 顺序错误');
      await command('host', { type: 'review', submissionId: opponentTask.submission.id, result: 'approve' }, 409);
      const view = await state('opponent'); ensure(!view.submissions.some((item: any) => item.teamId === 'team-1'), '泄露了他队照片或提交身份');
    });
    await step('AC-06', '最早提交打回后，下一条有效提交唯一计分', async () => {
      await review(rejectedTask.submission.id, 'reject', '照片不符合要求'); await review(opponentTask.submission.id);
      const view = await state('host'); ensure(view.awards.T01.teamId === 'team-2' && view.ledger.filter((item: any) => item.category === 'TASK' && item.reference === 'T01').length === 1 && (await state('opponent')).team.score === 5, '任务归属或账本不唯一');
    });
    await step('AC-07', '已归属任务仍可上传，通过后不重复计分', async () => {
      const item = await submit('player', 'task', 'T01'); const outcome = await review(item.submission.id);
      ensure(outcome.submission.status === 'APPROVED_NON_SCORING' && (await state()).team.score === 0, '后续提交重复计分');
    });
    await step('SCORE / LIMIT', '按配置计算基础分、棋盘奖励与每区五项上限', async () => {
      for (const task of ['T02', 'T03', 'T04', 'T05', 'T06']) { const item = await submit('player', 'task', task); await review(item.submission.id); }
      const sixth = await command('player', { type: 'submit', kind: 'task', taskId: 'T07', regionId: 'stage-a', media: image }, 409); ensure(sixth.code === 'REGION_OPENING_REQUIRED', '达到上限后未强制进入开场谜题');
      const view = await state(); ensure(view.team.score === 35, `预期五项基础分 25 + 配置化棋盘奖励 10，实际 ${view.team.score}`);
    });
    await step('AC-09', '队内两设备同时用卡只成功一次', async () => {
      const responses = await Promise.all(['player', 'member'].map(role => fetch(`${base}/api${path('/commands')}`, { method: 'POST', headers: { Authorization: `Bearer ${tokens[role]}`, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ type: 'use_card', cardId: 'boost', targetTeamId: 'team-1' }), signal: options.signal ?? AbortSignal.timeout(20000) })));
      ensure(responses.filter(response => response.status === 200).length === 1 && responses.filter(response => response.status === 409).length === 1, '卡牌并发消费重复成功');
      ensure((await state()).team.score === 38 && (await state()).cards.find((item: any) => item.id === 'boost').uses === 0, '卡牌账本或库存错误');
    });
    await step('AC-10', '随机事件候选、重抽留痕和一次发放', async () => {
      const event = (await state()).events[0]; await command('host', { type: 'event_draw', eventId: event.id });
      await command('host', { type: 'event_draw', eventId: event.id }, 400); await command('host', { type: 'event_draw', eventId: event.id, reason: '测试重抽' });
      await command('host', { type: 'event_confirm', eventId: event.id, targetTeamId: 'team-1' }); await command('host', { type: 'event_confirm', eventId: event.id, targetTeamId: 'team-1' }, 409);
      ensure((await state()).team.score === 40, '事件分值重复发放或未到账');
    });
    await step('CARD-CONFIRM', '高影响卡牌确认前不扣除，通知确认后才开始计时', async () => {
      const result = await command('player', { type: 'use_card', cardId: 'jam', targetTeamId: 'team-2' }); ensure((await state()).cards.find((item: any) => item.id === 'jam').uses === 1, '待确认卡提前消耗');
      await command('host', { type: 'confirm_card', requestId: result.pending.id, result: 'approve' }); const effect = (await state('opponent')).effects[0]; ensure(effect.startedAt === null, '负面效果静默计时');
      await advance(60000); ensure((await state('opponent')).effects[0].startedAt === null, '未确认效果自行启动'); await command('opponent', { type: 'ack_effect', effectId: effect.id });
    });
    await step('AC-12', '暂停冻结排名与临时信息授权，拒绝玩家写入', async () => {
      await request(path('/scores/team-2'), 'player', 'GET', undefined, 403); await command('player', { type: 'use_card', cardId: 'scan', targetTeamId: 'team-2' }); ensure((await request(path('/scores/team-2'))).score === 5, '卡牌信息授权未生效');
      const before = await state(); await command('host', { type: 'transition', status: 'PAUSED' }); await advance(300000); const after = await state(); ensure(after.elapsedMs === before.elapsedMs, '暂停仍累计比赛时间');
      ensure((await request(path('/scores/team-2'))).score === 5, '暂停期间授权时间未冻结'); await command('player', { type: 'submit', kind: 'task', taskId: 'T08', regionId: 'stage-a', media: image }, 409);
      await command('host', { type: 'transition', status: 'RUNNING' }); await advance(300001); await request(path('/scores/team-2'), 'player', 'GET', undefined, 403);
    });
    const position = (latitude = 30.2741) => ({ type: 'location', latitude, longitude: 120.1551, accuracy: 8, capturedAt: Date.now(), foreground: true });
    await step('LOCATION-AUTH', '只允许队长上报，工作人员按位置能力查看', async () => {
      await command('member', position(), 403); await command('player', { ...position(), foreground: false }, 409); await command('player', { ...position(), latitude: 100 }, 400);
      ensure((await state('reviewer')).locations === undefined && Array.isArray((await state('tracker')).locations), '位置能力权限失效');
    });
    await step('AC-13', '三秒节流、六十秒采样与服务端接收时间', async () => {
      const first = await command('player', position()); await command('player', position(), 429); await advance(2999); await command('player', position(), 429); await advance(1);
      await command('player', position(30.2742)); ensure((await state('host')).locationHistory.length === 1, '高频位置被重复保存为轨迹点');
      await advance(57000); const sample = await command('player', position(30.2743)); ensure(sample.sampled && (await state('host')).locationHistory.length === 2 && sample.position.receivedAt > first.position.receivedAt, '六十秒采样失败');
      lastPosition = (await state('tracker')).locations[0]; ensure(lastPosition.status === 'online' && lastPosition.latitude === 30.2743, '位置列表未实时更新');
    });
    await step('AC-14 / TC-07', '二十秒停更标记离线，保留列表中的最后位置', async () => {
      await advance(20001); const view = (await state('tracker')).locations[0]; ensure(view.status === 'offline' && view.latitude === lastPosition.latitude && view.receivedAt === lastPosition.receivedAt, '离线定位或列表降级数据错误');
    });
    await step('AC-11', '四十分钟排名快照显示两分钟后隐藏', async () => {
      await advance(2400000 - (await state()).elapsedMs); ensure((await state()).rankingSnapshot?.ranking.length === 2 && (await state('opponent')).rankingSnapshot?.ranking.length === 2, '全队排名快照未开放');
      await advance(120000); ensure((await state()).rankingSnapshot === null && (await state('host')).snapshots.length === 1, '玩家入口未隐藏或后台历史丢失');
    });
    await step('NC-03 / NC-04 / NC-05', '未读补取、按设备记录动画且位置和排名不产生推送', async () => {
      const messages = (await request(path('/messages'))).messages; const reviewMessage = messages.find((item: any) => item.type === 'review' && !item.read); ensure(reviewMessage, '审核未读消息丢失');
      await command('player', { type: 'read_message', messageId: reviewMessage.id, deviceId: 'test-device', played: true }); const replay = (await request(path('/messages?deviceId=test-device'))).messages.find((item: any) => item.id === reviewMessage.id); ensure(replay.read && replay.played, '已读和动画播放状态未保存');
      ensure(!messages.some((item: any) => ['location', 'ranking'].includes(item.type) && item.pushEligible), '位置或排名触发系统通知');
      ensure((await request(path(`/messages?after=${messages.at(-1)?.id ?? 0}`))).messages.length === 0, '消息序号补取错误');
    });
    await step('TC-01 / REALTIME', '五十个真实 WebSocket 连接接收状态更新', async () => {
      const sockets: WebSocket[] = []; const address = `${base.replace(/^http/, 'ws')}/api${path('/ws')}`;
      try {
        await Promise.all(Array.from({ length: 50 }, () => new Promise<void>((resolve, reject) => {
          const socket = new WebSocket(address, ['hrg-test-v1', tokens.player]); sockets.push(socket); const timeout = setTimeout(() => reject(new Error('WebSocket 连接超时')), 10000);
          socket.addEventListener('message', event => { const message = JSON.parse(String(event.data)); if (message.type === 'ready') { clearTimeout(timeout); ensure(!message.state.teams, '实时消息泄露他队数据'); resolve(); } }, { once: true });
          socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('WebSocket 连接失败')); }, { once: true });
        })));
        const start = performance.now(); const received = Promise.all(sockets.map(socket => new Promise<void>((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('三秒内未收到状态更新')), 3000); socket.addEventListener('message', () => { clearTimeout(timeout); resolve(); }, { once: true }); })));
        await command('host', { type: 'correct_score', teamId: 'team-1', points: 1, reason: '验证实时广播' }); await received; ensure(performance.now() - start < 3000, '广播延迟超过三秒');
      } finally { sockets.forEach(socket => socket.close()); }
    });
    await step('AC-17 / TC-09', '配置版本、人工更正账本和存储预警留痕', async () => {
      const old = await state('host'); await command('host', { type: 'correct_score', teamId: 'team-1', points: 4, reason: '人工复核' }); await command('host', { type: 'configure', patch: { taskLimit: 6, storageWarnBytes: 1 }, reason: '测试配置新版本' });
      const current = await state('host'); ensure(current.configVersion === old.configVersion + 1 && current.ledger.length === old.ledger.length + 1 && old.ledger.every((entry: any, index: number) => JSON.stringify(entry) === JSON.stringify(current.ledger[index])) && current.audit.at(-1).reason === '测试配置新版本' && current.storage.warning, '历史账本被修改或版本、审计、预警未记录');
    });
    await step('AC-18', '占位棋盘读取真实后端任务状态和入口数据', async () => { const view = await state(); ensure(view.tasks.length === 25 && view.tasks.every((item: any) => item.id && item.image && item.brief), '后端任务视图不能供棋盘适配器使用'); options.onBoard?.(view.tasks); });
    await step('TC-08', '备份校验与恢复到新赛局，不覆盖原数据库', async () => {
      backup = await request(path('/backup'), 'control'); const restored = await request('/testing/restore', 'control', 'POST', backup);
      try {
        const login = await request(`/testing/runs/${restored.id}/login`, 'anonymous', 'POST', run!.credentials.player); tokens.restored = login.token;
        const view = await request(`/testing/runs/${restored.id}/state`, 'restored'); ensure(view.team.score === 45 && view.location.status === 'offline' && view.tasks.length === 25, '恢复后状态不一致');
        const damaged = { ...backup, content: backup.content + ' ' }; await request('/testing/restore', 'control', 'POST', damaged, 400);
      } finally { await request(`/testing/runs/${restored.id}`, 'control', 'DELETE'); }
    });
    await step('REGION-PRESERVE', '下一地区只更换图寻区域，不清空任务归属与分数', async () => {
      const next = await submit('player', 'arrival', undefined, 'stage-b'); await review(next.submission.id); const view = await state(); ensure(view.team.regionId === 'stage-b' && view.team.score === 45 && view.tasks.find((task: any) => task.id === 'T02').awarded && view.events.length === 2, '换区重置了任务或分数');
    });
    await step('AC-15', '完赛停止位置、普通任务和卡牌，箭头固定金色', async () => {
      await command('host', { type: 'finish_team', teamId: 'team-1' }); await command('player', position(), 409); await command('player', { type: 'submit', kind: 'task', regionId: 'stage-b', taskId: 'T08', media: image }, 409); await command('member', { type: 'use_card', cardId: 'boost', targetTeamId: 'team-1' }, 409);
      const view = (await state('tracker')).locations[0]; ensure(view.status === 'finished' && view.color === '#f6c84f' && view.latitude === lastPosition.latitude, '完赛箭头未固定');
    });
    await step('AC-16', '全队完赛只提示工作人员，必须手动结束', async () => {
      await command('host', { type: 'finish_team', teamId: 'team-2' }); const view = await state('host'); ensure(view.allFinished && view.status === 'RUNNING', '全队完赛自动结束了比赛'); await command('host', { type: 'transition', status: 'FINISHED' }); await command('host', { type: 'transition', status: 'RUNNING' }, 409);
    });
    for (const [id, title, detail] of [
      ['NC-01', 'iPhone PWA 锁屏通知实机验收', '需要 HTTPS、主屏幕安装、VAPID 推送服务及真实手机；不能用接口响应代替锁屏通知。'],
      ['NC-02', 'Android PWA 后台通知实机验收', '需要真实手机和配置后的 Web Push；当前测试后端只验证通知记录，不发送真实系统通知。'],
      ['TC-06', '服务器异常退出后的持久化恢复', '命令行本机集成测试另行验证重启；异地服务器部署后仍须验证进程退出与卷挂载。'],
      ['TC-10', '正式活动开赛前置条件', '测试后端是独立赛局沙箱；正式活动 API、推送和完整素材仍需独立发布验收。']
    ]) publish({ id, title, status: 'manual', detail, durationMs: 0 });
  } finally {
    if (run?.id) {
      try { const response = await fetch(`${base}/api/testing/runs/${run.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${options.key}` }, signal: AbortSignal.timeout(10000) }); ensure(response.ok, '清理测试赛局失败'); }
      catch { publish({ id: 'CLEANUP', title: '清理独立测试赛局', status: 'failed', detail: '清理失败；只影响测试赛局，两小时后不可访问，下次创建赛局时清除过期记录。', durationMs: 0 }); }
    }
  }
  return { startedAt, finishedAt: new Date().toISOString(), target: base, database, results, passed: results.filter(item => item.status === 'passed').length, failed: results.filter(item => item.status === 'failed').length, manual: results.filter(item => item.status === 'manual').length };
}
