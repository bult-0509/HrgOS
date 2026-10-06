import { validateTestApiBase } from './ruleSuite.ts';
import { runGlobalCardGrantCheck } from './globalCardGrantCheck.ts';
import type { RuleResult, SuiteOptions, SuiteReport } from './ruleSuite.ts';

const fixtureImage = { name: 'readiness.png', mime: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGPgkuT6D8IMMAYAJKIEsYXC9Q4AAAAASUVORK5CYII=' };
const assert = (valid: unknown, message: string) => { if (!valid) throw new Error(message); };

/** 验收新要求；功能缺失时真实报告失败，不把预设沙箱功能当作正式页面完成。 */
export async function runFeatureReadiness(options: SuiteOptions): Promise<SuiteReport> {
  const base = validateTestApiBase(options.baseUrl);
  const startedAt = new Date().toISOString(); const results: RuleResult[] = [];
  const tokens: Record<string, string> = {}; let runId = ''; let database = 'unknown';
  const publish = (result: RuleResult) => { results.push(result); options.onResult?.(result); };
  const step = async (id: string, title: string, action: () => Promise<string>) => {
    options.signal?.throwIfAborted(); const begin = performance.now();
    try { const detail = await action(); publish({ id, title, status: 'passed', detail, durationMs: Math.round(performance.now() - begin) }); }
    catch (error) { options.signal?.throwIfAborted(); publish({ id, title, status: 'failed', detail: error instanceof Error ? error.message : '验收失败', durationMs: Math.round(performance.now() - begin) }); }
  };
  const request = async (path: string, role: string, method = 'GET', body?: unknown) => {
    const response = await fetch(`${base}/api${path}`, { method, headers: { Authorization: `Bearer ${role === 'control' ? options.key : tokens[role] ?? ''}`, ...(body !== undefined ? { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
    const result = await response.json();
    if (!response.ok) throw new Error(`HTTP ${response.status} ${result.code ?? ''}${result.code === 'COMMAND_UNKNOWN' ? '：当前后端没有实现该功能接口' : ''}`);
    return result;
  };
  const path = (suffix: string) => `/testing/runs/${runId}${suffix}`;
  const command = (role: string, body: unknown) => request(path('/commands'), role, 'POST', body);
  const state = (role = 'host') => request(path('/state'), role);
  const review = (id: string) => command('host', { type: 'review', submissionId: id, result: 'approve' });
  try {
    const health = await request('/health', 'anonymous'); database = health.database;
    assert(health.testApiEnabled, '后端未启用独立测试环境');
    const run = await request('/testing/runs', 'control', 'POST', {}); runId = run.id;
    for (const name of ['player', 'opponent', 'host']) tokens[name] = (await request(path('/login'), 'anonymous', 'POST', run.credentials[name])).token;
    await command('host', { type: 'transition', status: 'RUNNING' });

    let arrivalId = '';
    await step('F-IMAGE', '图片提交后工作人员能接收并读取原图', async () => {
      const submitted = await command('player', { type: 'submit', kind: 'arrival', regionId: 'stage-a', media: fixtureImage }); arrivalId = submitted.submission.id;
      const staff = await state(); assert(staff.queue.some((item: { id: string }) => item.id === arrivalId), '工作人员未收到队列记录');
      const response = await fetch(`${base}/api${path(`/media/${submitted.media.id}`)}`, { headers: { Authorization: `Bearer ${tokens.host}` }, signal: AbortSignal.timeout(20000) });
      const bytes = await response.arrayBuffer();
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(byte => byte.toString(16).padStart(2, '0')).join('');
      assert(response.ok && digest === submitted.media.sha256 && bytes.byteLength > 0, '工作人员无法读取完整原图或原图哈希不一致');
      return '真实 HTTP：玩家提交图片 → 工作人员队列 → 原图读取成功；仅证明沙箱接口。';
    });
    if (!arrivalId) throw new Error('图片前置验收失败，无法继续区域和事件验收');
    await review(arrivalId);

    await step('F-EVENT', '预设随机事件抽取、发放与队伍接收', async () => {
      const pending = (await state()).events.find((item: { teamId: string; status: string }) => item.teamId === 'team-1' && item.status === 'PENDING');
      assert(pending, '区域审核后没有生成待发放事件');
      const before = (await state('player')).team.score;
      await command('host', { type: 'event_draw', eventId: pending.id });
      const drawn = (await state()).events.find((item: { id: string }) => item.id === pending.id); const amount = drawn.candidate.amount;
      await command('host', { type: 'event_confirm', eventId: pending.id, targetTeamId: 'team-1' });
      const player = await state('player'); const messages = await request(path('/messages'), 'player');
      assert(player.team.score === before + amount && messages.messages.some((item: { type: string; reference: string }) => item.type === 'event' && item.reference === pending.id), '事件效果或队伍收件失败');
      return '预设加分事件已写入账本和本队消息；当前候选库只有一种测试事件，未证明正式工作人员按钮可用。';
    });

    await step('F-EVENT-CREATE', '工作人员现场创作事件内容并发放', async () => {
      const created = await command('host', { type: 'event_create', title: '声音侦探', description: '找三种不同的环境声，用一句话讲成故事；不得录入路人私人谈话。', rewardPoints: 2, targetTeamId: 'team-1' });
      assert(created.event?.id, '创作接口未返回事件');
      await command('host', { type: 'event_confirm', eventId: created.event.id, targetTeamId: 'team-1' });
      const player = await state('player'); assert(player.events.some((item: { id: string; title: string; description: string }) => item.id === created.event.id && item.title === '声音侦探' && item.description), '队伍没有收到完整的创作内容');
      return '工作人员创作内容已保存并发至目标队伍。';
    });
    await step('F-TEXT', '玩家发送文本，工作人员收到完整内容', async () => {
      const text = '测试文本：请求工作人员确认区域入口。';
      const sent = await command('player', { type: 'send_message', recipient: 'staff', text });
      const received = await request(path('/messages'), 'host');
      assert(sent.message?.id && received.messages.some((item: { id: string; text: string }) => item.id === sent.message.id && item.text === text), '工作人员没有收到完整文本');
      return '玩家文本已保存并由工作人员读回。';
    });

    await step('F-LOCATION', '连续位置更新、工作人员读取与轨迹记录', async () => {
      const initial = (await state()).serverTime;
      const send = (latitude: number, capturedAt: number) => command('player', { type: 'location', latitude, longitude: 120.15, accuracy: 10, capturedAt, foreground: true });
      await send(30.25, initial);
      await request(path('/clock'), 'control', 'POST', { milliseconds: 3000 }); await send(30.2501, initial + 3000);
      const first = await state(); assert(first.locations.find((item: { teamId: string }) => item.teamId === 'team-1')?.latitude === 30.2501, '工作人员位置未更新');
      assert(first.locationHistory.filter((item: { teamId: string }) => item.teamId === 'team-1').length === 1, '三秒更新错误地产生一分钟轨迹点');
      await request(path('/clock'), 'control', 'POST', { milliseconds: 57000 }); await send(30.2502, initial + 60000);
      const last = await state(); const history = last.locationHistory.filter((item: { teamId: string }) => item.teamId === 'team-1');
      assert(history.length === 2 && history[1].latitude === 30.2502, '轨迹没有保存新的采样点');
      return '三次合成坐标经 HTTP 更新到工作人员视图，六十秒采样形成两条持久轨迹；真实手机 GPS 和正式页面接入仍需验收。';
    });

    await step('F-GLOBAL-CARD', '全体每10个任务向每队发一张共享能力卡', async () => {
      const result = await runGlobalCardGrantCheck(options);
      assert(result.status === 'passed', result.detail); return result.detail;
    });

    await step('F-LOWEST-CHALLENGE', '识别最低分队伍并发送工作人员特殊挑战', async () => {
      const staff = await state(); const active = staff.teams.filter((team: { finishedAt: number | null }) => team.finishedAt == null);
      const lowestScore = Math.min(...active.map((team: { score: number }) => team.score));
      const lowest = active.filter((team: { score: number }) => team.score === lowestScore);
      assert(lowest.length === 1 && lowest[0].id === 'team-2', '没有正确找出最低分队伍');
      const challenge = await command('host', { type: 'send_challenge', teamId: lowest[0].id, title: '逆转挑战', description: '用三十秒描述本区域最有意思的一处细节。', rewardPoints: 5 });
      const messages = await request(path('/messages'), 'opponent');
      assert(challenge.challenge?.id && messages.messages.some((item: { reference: string; text: string }) => item.reference === challenge.challenge.id && item.text.includes('逆转挑战')), '最低队伍没有收到特殊挑战');
      return '最低分队伍已识别，特殊挑战发送成功。';
    });
    publish({ id: 'F-MAIN-PAGES', title: '正式玩家与工作人员页面的跨设备链路', status: 'manual', detail: '上述通过项属于隔离后端接口。必须另验主页面的事件按钮、真实文件上传、最低队伍挑战入口和 GPS 接入；不能用沙箱通过替代。', durationMs: 0 });
    publish({ id: 'F-MOTION', title: '动效交互、减少动态效果与手机性能', status: 'manual', detail: '需要浏览器检查动效和 prefers-reduced-motion，并在目标手机检测卡顿、耗电和输入阻塞；HTTP 无法验收视觉性能。', durationMs: 0 });
  } finally {
    if (runId) try {
      const response = await fetch(`${base}/api${path('')}`, { method: 'DELETE', headers: { Authorization: `Bearer ${options.key}` }, signal: AbortSignal.timeout(10000) });
      assert(response.ok, '清理失败');
    } catch { publish({ id: 'F-CLEANUP', title: '清理专项测试赛局', status: 'failed', detail: '清理失败，测试数据两小时后不可访问，下次创建赛局时清除。', durationMs: 0 }); }
  }
  return { startedAt, finishedAt: new Date().toISOString(), target: base, database, results, passed: results.filter(item => item.status === 'passed').length, failed: results.filter(item => item.status === 'failed').length, manual: results.filter(item => item.status === 'manual').length };
}
