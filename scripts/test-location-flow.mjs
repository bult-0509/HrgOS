import { randomBytes, createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { createLocalStore } from '../server/store.mjs';
import { createTestServer } from '../server/app.mjs';

// 使用正式 /api/games 路由和真实 HTTP；所有账号、坐标和数据库均为独立合成测试资料。
// 只诊断现状，陈旧/未来时间等缺口保持 failed，不把不符合需求的行为改成通过。
const outputRoot = path.resolve('artifacts/device-location-20261007');
await mkdir(outputRoot, { recursive: true });
const directory = await mkdtemp(path.join(outputRoot, 'location-flow-'));
const key = randomBytes(32).toString('hex'), password = randomBytes(24).toString('hex');
const salt = randomBytes(16).toString('hex');
const passwordHash = createHash('sha256').update(`${salt}:${password}`).digest('hex');
const accounts = [
  { username: 'hrg-staff-01', role: 'staff' },
  { username: 'fixture-reviewer', role: 'staff' },
  { username: 'fixture-leader', role: 'player', teamId: 'team-1' },
  { username: 'fixture-member', role: 'player', teamId: 'team-1' },
  { username: 'fixture-opponent', role: 'player', teamId: 'team-2' },
].map(account => ({ ...account, salt, passwordHash }));
const image = { name: 'synthetic.png', mime: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGPgkuT6D8IMMAYAJKIEsYXC9Q4AAAAASUVORK5CYII=' };
const results = [], startedAt = new Date().toISOString();
const check = (condition, message) => { if (!condition) throw new Error(message); };
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let store, app, base, gameId;
const tokens = {};
async function step(id, title, action) {
  const start = performance.now();
  try { const detail = await action(); results.push({ id, title, status: 'passed', detail, durationMs: Math.round(performance.now() - start) }); }
  catch (error) { results.push({ id, title, status: 'failed', detail: error.message, durationMs: Math.round(performance.now() - start) }); }
  const result = results.at(-1); console.log(`[${result.status}] ${id} ${title}${result.status === 'failed' ? '：' + result.detail : ''}`);
}
async function request(suffix, token, method = 'GET', body, idempotencyKey = crypto.randomUUID()) {
  const response = await fetch(base + suffix, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  return { status: response.status, data: await response.json() };
}
const prefix = suffix => `/api/games/${gameId}${suffix}`;
const command = (role, body, idempotencyKey) => request(prefix('/commands'), tokens[role], 'POST', body, idempotencyKey);
const state = async role => { const response = await request(prefix('/state'), tokens[role]); check(response.status === 200, '状态接口读取失败'); return response.data; };
const point = (delta = 0, capturedAt = Date.now()) => ({ type: 'location', latitude: 30.2 + delta, longitude: 120.1, accuracy: 8, capturedAt, foreground: true });
const expectCode = (response, status, code) => check(response.status === status && response.data.code === code, `预期 ${status} ${code}，实际 ${response.status} ${response.data.code ?? '成功响应'}`);
try {
  store = await createLocalStore(directory);
  app = await createTestServer({ store, gameAdminKey: key, liveAccounts: accounts });
  base = await app.listen({ host: '127.0.0.1', port: 0 });
  const created = await request('/api/games', key, 'POST', {});
  check(created.status === 201 && created.data.configured, '无法创建独立正式接口测试赛局'); gameId = created.data.id;
  for (const [role, index] of Object.entries({ host: 0, reviewer: 1, leader: 2, member: 3, opponent: 4 })) {
    const response = await request(prefix('/login'), '', 'POST', { username: accounts[index].username, role: accounts[index].role, password });
    check(response.status === 200, '合成账号登录失败'); tokens[role] = response.data.token;
    if (role === 'leader') check(response.data.leader === true, '队长身份错误');
    if (role === 'member') check(response.data.leader === false, '队员错误取得队长身份');
  }
  await step('L-READY', '开赛前不能上传定位', async () => { expectCode(await command('leader', point()), 409, 'GAME_NOT_RUNNING'); return '正式比赛READY状态拒绝定位。'; });
  check((await command('host', { type: 'transition', status: 'RUNNING' })).status === 200, '无法启动测试赛局');
  await step('L-AUTH', '队员与工作人员不能冒充队长上传', async () => {
    for (const role of ['member', 'host']) expectCode(await command(role, point()), 403, 'LEADER_ONLY');
    return '非队长上传均被正式接口拒绝。';
  });
  await step('L-INVALID', '坐标范围和负精度拒绝', async () => {
    for (const patch of [{ latitude: 91 }, { longitude: 181 }, { accuracy: -1 }]) expectCode(await command('leader', { ...point(), ...patch }), 400, 'LOCATION_INVALID');
    return '无效坐标和精度未写入数据库。';
  });
  await step('L-BACKGROUND', '后台标记不能上传定位', async () => { expectCode(await command('leader', { ...point(), foreground: false }), 409, 'PAGE_NOT_FOREGROUND'); return '服务端拒绝明确标记后台的请求；不能由此证明浏览器后台采集已停止。'; });
  let latest, firstReceipt;
  await step('L-FIRST', '队长上传→数据库→有权限工作人员读回', async () => {
    latest = point(); const sent = await command('leader', latest); check(sent.status === 200 && sent.data.sampled, '首次定位未接收或未采样'); firstReceipt = sent.data.position.receivedAt;
    const host = await state('host'), saved = host.locations.find(item => item.teamId === 'team-1');
    check(saved.latitude === latest.latitude && saved.longitude === latest.longitude && saved.accuracy === latest.accuracy && saved.capturedAt === latest.capturedAt && saved.status === 'online', '工作人员读回与上传不一致');
    check(host.locationHistory.length === 1, '首次历史轨迹数量异常'); return '真实HTTP与正式权限完成闭环，使用合成定位，未采集手机GPS。';
  });
  await step('L-PRIVACY', '普通工作人员与其他队看不到完整位置和轨迹', async () => {
    const reviewer = await state('reviewer'), opponent = await state('opponent');
    check(reviewer.locations === undefined && reviewer.locationHistory === undefined && opponent.locations === undefined && opponent.locationHistory === undefined, '位置权限泄露');
    return '完整位置和轨迹仅定位权限工作人员可读取。';
  });
  await step('L-IDEMPOTENT', '同一次定位请求重试只记一次', async () => {
    await wait(3100); latest = point(0.001); const id = crypto.randomUUID();
    const first = await command('leader', latest, id), repeat = await command('leader', latest, id);
    check(first.status === 200 && repeat.status === 200 && first.data.position.receivedAt === repeat.data.position.receivedAt, '相同幂等键重复入库');
    firstReceipt = first.data.position.receivedAt; return '服务端支持相同幂等键重试；不代表正式客户端人工重试会沿用原键。';
  });
  await step('L-THROTTLE', '不同请求在三秒窗口内受限', async () => { expectCode(await command('leader', point(0.002)), 429, 'LOCATION_THROTTLED'); return '正式接口按服务端收到时间进行三秒节流。'; });
  await step('L-UPDATE', '三秒后最新位置更新且不高频新增历史点', async () => {
    await wait(3100); latest = point(0.002); check((await command('leader', latest)).status === 200, '三秒后新位置未接收');
    const host = await state('host'); check(host.locations[0].latitude === latest.latitude && host.locationHistory.length === 1, '当前定位或一分钟历史采样异常');
    firstReceipt = host.locations[0].receivedAt; return '当前位置更新，六十秒内仍只有首次历史样本。完整六十秒边界另由规则联调验证。';
  });
  await step('L-PAUSE', '暂停拒绝上传，恢复保留定位', async () => {
    check((await command('host', { type: 'transition', status: 'PAUSED' })).status === 200, '暂停失败');
    expectCode(await command('leader', point(0.003)), 409, 'GAME_PAUSED');
    check((await command('host', { type: 'transition', status: 'RUNNING' })).status === 200, '恢复失败');
    check((await state('leader')).location.receivedAt === firstReceipt, '暂停请求改写了定位'); return '暂停拒绝写入，恢复后原定位保留。';
  });
  await step('L-OFFLINE', '真实等待超过二十秒，工作人员看到离线并保留最后位置', async () => {
    await wait(Math.max(0, 20500 - (Date.now() - firstReceipt)));
    const host = await state('host'), saved = host.locations[0];
    check(saved.status === 'offline' && saved.receivedAt === firstReceipt && saved.latitude === latest.latitude, '离线判定或最后位置错误');
    return '用真实服务器时间等待超过20秒，未使用测试时钟。';
  });
  await step('L-RECONNECT', '停更后恢复上报，工作人员重新看到在线', async () => {
    latest = point(0.003); check((await command('leader', latest)).status === 200, '恢复上报失败'); check((await state('host')).locations[0].status === 'online', '恢复后仍离线');
    return '再次上传后实时视图恢复；这不是Wi-Fi/蜂窝切换的手机实测。';
  });
  await step('L-STALE', '陈旧GPS样本不应覆盖当前新位置', async () => {
    await wait(3100); const response = await command('leader', point(0.004, Date.now() - 3600000));
    check(response.status >= 400, '一小时前的样本仍返回200并覆盖当前定位；capturedAt缺少新鲜度/顺序校验。');
    check((await state('host')).locations[0].latitude === latest.latitude, '陈旧样本改写了新位置'); return '陈旧定位被拒绝。';
  });
  await step('L-FUTURE', '明显超前的设备时间不应作为有效GPS样本', async () => {
    await wait(3100); const response = await command('leader', point(0.005, Date.now() + 600000));
    check(response.status >= 400, '十分钟后的采集时间仍返回200；capturedAt只检查有限数值，没有时钟偏差边界。'); return '明显未来时间样本被拒绝。';
  });
  await step('L-FINISH', '末区域审核与完赛后停止接受新定位', async () => {
    for (const regionId of ['stage-a', 'stage-b', 'stage-c']) {
      const sent = await command('leader', { type: 'submit', kind: 'arrival', regionId, media: image }); check(sent.status === 200, '区域证据提交失败');
      check((await command('host', { type: 'review', submissionId: sent.data.submission.id, result: 'approve' })).status === 200, '区域审核失败');
      if (regionId === 'stage-a') await step('F-LIVE-EVENT', '正式区域审核后的随机事件能够抽取', async () => {
        const view = await state('host');
        const event = view.events.find(item => item.teamId === 'team-1' && item.status === 'PENDING');
        check(event, '正式区域审核没有产生事件记录');
        const response = await command('host', { type: 'event_draw', eventId: event.id });
        check(response.status === 200, `正式事件抽取返回${response.status} ${response.data.code ?? ''}；新赛局的eventTemplates为空。`);
        return '正式区域事件有可用候选池。';
      });
    }
    check((await command('host', { type: 'finish_team', teamId: 'team-1', reason: '独立定位流程验收' })).status === 200, '完赛确认失败');
    expectCode(await command('leader', point(0.006)), 409, 'TEAM_FINISHED'); const view = await state('host');
    check(view.locations[0].status === 'finished' && view.locations[0].color === '#f6c84f', '完赛定位状态错误'); return '三地区到达审核、有效完赛、拒绝新定位、金色完赛状态均通过。';
  });
} catch (error) {
  results.push({ id: 'L-SETUP', title: '正式接口隔离测试前置条件', status: 'failed', detail: error.message, durationMs: 0 });
} finally {
  if (app) await app.close(); if (store) await store.close();
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(outputRoot + path.sep) || !path.basename(resolved).startsWith('location-flow-')) throw new Error('清理目标超出定位测试目录');
  await rm(resolved, { recursive: true, force: true });
}
const report = { startedAt, finishedAt: new Date().toISOString(), timezone: 'Asia/Shanghai', target: 'local-formal-api', database: 'pglite-local-verification', syntheticCoordinates: true, realDeviceGpsTested: false, passed: results.filter(r => r.status === 'passed').length, failed: results.filter(r => r.status === 'failed').length, results };
await writeFile(path.join(outputRoot, 'formal-location-flow.json'), JSON.stringify(report, null, 2));
console.log(`正式定位接口流程：${report.passed}通过，${report.failed}失败；报告 artifacts/device-location-20261007/formal-location-flow.json。`);
process.exitCode = report.failed ? 1 : 0;
