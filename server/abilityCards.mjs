import { randomUUID, randomInt, createHash } from 'node:crypto';
import baseCatalog from '../src/data/abilityCatalog.json' with { type: 'json' };

const minute = 60000;
export const periodicAbilityIntervalMs = 30 * minute;
// 正式发卡与本地卡面共用同一份既有目录，不在预览里另编规则。
export const abilityCatalog = structuredClone(baseCatalog);
export function ensureAbilities(state) {
  state.abilityCatalog ??= structuredClone(abilityCatalog);
  // 为已持久化的旧赛局补入新增卡，保留工作人员原有配置。
  for (const definition of abilityCatalog) if (!state.abilityCatalog.some(card => card.number === definition.number)) state.abilityCatalog.push(structuredClone(definition));
  state.abilityCards ??= []; state.abilityUses ??= []; state.abilityConfigHistory ??= []; state.abilityRegionGrants ??= []; state.activeAssignments ??= {};
  state.config.reserveTasks ??= []; state.abilityExtraDraws ??= [];
  state.abilityPeriodicWaves ??= []; state.lastAbilityPeriodicWave ??= 0;
  state.abilityTaskGrants ??= [];
}
export function abilityTaskProgress(state) {
  const completedTasks = new Set(state.submissions.filter(item => item.kind === 'task' && item.status.startsWith('APPROVED')).map(item => `${item.teamId}:${item.taskId}`)).size;
  return { completedTasks, interval: 10, distributedRounds: state.abilityTaskGrants.length, nextAt: (state.abilityTaskGrants.length + 1) * 10 };
}
export const validTaskDefinition = task => task && typeof task.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(task.id) && typeof task.title === 'string' && task.title.trim() && task.title.length <= 100 && typeof task.brief === 'string' && task.brief.trim() && task.brief.length <= 2000 && Number.isSafeInteger(task.points) && task.points > 0 && task.points <= 10000;
export function validateReserveTasks(tasks, boardTasks, check) {
  check(Array.isArray(tasks) && tasks.length <= 500 && tasks.every(validTaskDefinition) && new Set(tasks.map(task => task.id)).size === tasks.length && tasks.every(task => !boardTasks.some(board => board.id === task.id)), 'RESERVE_TASK_CONFIG_INVALID', 400);
  return tasks.map(({ id, title, brief, points }) => ({ id, title, brief, points }));
}
const extraCandidates = (state, teamId) => state.config.reserveTasks.filter(task => !state.config.tasks.some(board => board.id === task.id) && !state.abilityExtraDraws.some(draw => draw.teamId === teamId && draw.taskId === task.id));
const gameTime = state => state.elapsedMs + (state.status === 'RUNNING' ? state.now - state.runningSince : 0);
export const abilityActive = (state, use) => use.status === 'ACTIVE' && use.startedAt != null && gameTime(state) - use.startedAt < use.definition.durationMs;
export const abilityScoreAccess = (state, teamId) => (state.abilityUses ?? []).some(use => use.number === 3 && use.casterTeamId === teamId && abilityActive(state, use));
export function abilityTick(state, services) {
  ensureAbilities(state);
  for (const use of state.abilityUses) if (use.status === 'ACTIVE' && !abilityActive(state, use)) use.status = [3, 8].includes(use.number) ? 'DONE' : 'AWAITING_REVIEW';
  if (state.status !== 'RUNNING' || !services) return;
  const due = Math.floor(gameTime(state) / periodicAbilityIntervalMs);
  const pool = state.abilityCatalog.filter(card => card.enabled);
  if (!pool.length) return;
  // 每次事务最多补齐12小时；较长离线期间的剩余轮次由下一次扫描继续补齐。
  const last = Math.min(due, state.lastAbilityPeriodicWave + 24);
  for (let wave = state.lastAbilityPeriodicWave + 1; wave <= last; wave++) {
    const recipients = state.teams;
    const cards = recipients.map(team => {
      const card = { id: randomUUID(), number: pool[randomInt(pool.length)].number, teamId: team.id, status: 'AVAILABLE', grantedAt: state.now, reason: `每半小时自动发放 · 第${wave}轮`, source: 'periodic', wave, scheduledElapsedMs: wave * periodicAbilityIntervalMs, revealedBy: [] };
      state.abilityCards.push(card); services.message(state, team.id, 'ability_grant', `第${wave}轮能力卡已发放，点击查看`, true, card.id);
      return { teamId: team.id, cardId: card.id };
    });
    state.abilityPeriodicWaves.push({ wave, scheduledElapsedMs: wave * periodicAbilityIntervalMs, grantedAt: state.now, cards });
    state.lastAbilityPeriodicWave = wave;
  }
}
export function taskPermissions(state, teamId) {
  ensureAbilities(state); const active = state.abilityUses.filter(use => use.targets.includes(teamId) && abilityActive(state, use));
  return { twoHands: active.some(use => use.number === 8) && !active.some(use => use.number === 18), oneHandOnly: active.some(use => use.number === 18), phoneTextOnly: active.some(use => use.number === 24), blockedBy: active.filter(use => [2, 4, 6, 13, 23].includes(use.number)).map(use => use.id) };
}
export function abilityTaskReviewed(state, item, services) {
  if (item.kind !== 'task' || !item.status.startsWith('APPROVED')) return;
  ensureAbilities(state);
  item.taskPoints = item.status === 'APPROVED_AWARDED' ? state.config.tasks.find(task => task.id === item.taskId).points : 0;
  const permission = taskPermissions(state, item.teamId);
  if (permission.twoHands) { const use = state.abilityUses.find(use => use.number === 8 && use.casterTeamId === item.teamId && abilityActive(state, use)); use.status = 'DONE'; use.consumedByTask = item.id; }
  if (state.activeAssignments[item.teamId]?.taskId === item.taskId) delete state.activeAssignments[item.teamId];
  const { completedTasks } = abilityTaskProgress(state);
  const pool = state.abilityCatalog.filter(card => card.enabled); if (!pool.length) return;
  for (let round = 1; round <= Math.floor(completedTasks / 10); round++) {
    if (state.abilityTaskGrants.some(grant => grant.round === round)) continue;
    const cards = state.teams.map(team => ({ id: randomUUID(), number: pool[randomInt(pool.length)].number, teamId: team.id, status: 'AVAILABLE', grantedAt: state.now, reason: `全体累计完成${round * 10}个任务自动发放`, grantRound: round, source: 'tasks', revealedBy: [] }));
    state.abilityCards.push(...cards);
    state.abilityTaskGrants.push({ round, completedTasks: round * 10, at: state.now, cardIds: cards.map(card => card.id) });
    for (const card of cards) services.message(state, card.teamId, 'ability_grant', `全体累计完成 ${round * 10} 个任务，本队获得一张共享能力卡`, true, card.id);
  }
}
export function abilityView(state, actor) {
  ensureAbilities(state);
  const staff = actor.manage || actor.review;
  return { periodicAbility: { intervalMs: periodicAbilityIntervalMs, distributedRounds: state.lastAbilityPeriodicWave, nextAtElapsedMs: (state.lastAbilityPeriodicWave + 1) * periodicAbilityIntervalMs, remainingMs: Math.max(0, (state.lastAbilityPeriodicWave + 1) * periodicAbilityIntervalMs - gameTime(state)), history: staff ? state.abilityPeriodicWaves : undefined }, abilityProgress: abilityTaskProgress(state), reserveTasks: staff ? state.config.reserveTasks : undefined, abilityCatalog: state.abilityCatalog, abilityCards: state.abilityCards.filter(card => staff || card.teamId === actor.teamId), abilityUses: state.abilityUses.filter(use => staff || use.casterTeamId === actor.teamId || use.targets.includes(actor.teamId) || use.number === 19 && abilityActive(state, use)).map(use => publicUse(use, actor)), huntLocations: state.abilityUses.filter(use => use.number === 19 && abilityActive(state, use)).map(use => ({ teamId: use.casterTeamId, useId: use.id, ...state.locations[use.casterTeamId], online: !!state.locations[use.casterTeamId] && !state.locations[use.casterTeamId].restored && state.now - state.locations[use.casterTeamId].receivedAt < state.config.offlineMs })), activeAssignment: state.activeAssignments[actor.teamId] ?? null, roster: state.accounts.filter(account => account.teamId && (staff || account.teamId === actor.teamId)).map(account => ({ id: account.id, username: account.username, nickname: account.nickname ?? account.username, teamId: account.teamId, leader: !!account.leader })), teamChoices: state.teams.map(team => ({ id: team.id, name: team.name, finished: !!team.finishedAt })) };
}
const publicUse = (use, actor) => ({ ...use, evidence: use.evidence.filter(item => actor.manage || actor.review || item.teamId === actor.teamId), anchors: actor.locations ? use.anchors : undefined, returnPosition: actor.locations || use.targets.includes(actor.teamId) ? use.returnPosition : undefined });
export const abilityResultView = (result, actor) => result.use ? { ...result, use: publicUse(result.use, actor) } : result;
export async function abilityCommand(state, actor, command, services) {
  ensureAbilities(state); const { requireRule: check, manage } = services;
  if (command.type === 'ability_reveal') {
    const card = state.abilityCards.find(card => card.id === command.instanceId && card.teamId === actor.teamId);
    check(actor.role === 'player' && card && Array.isArray(card.revealedBy), 'FORBIDDEN', 403);
    card.revealedBy ??= []; if (!card.revealedBy.includes(actor.id)) card.revealedBy.push(actor.id);
    return { revealed: true, instanceId: card.id };
  }
  if (command.type === 'ability_reserve_configure') {
    manage(actor); check(['READY', 'RUNNING', 'PAUSED'].includes(state.status) && command.reason?.trim(), 'CONFIG_INVALID', 400);
    const tasks = validateReserveTasks(command.tasks, state.config.tasks, check);
    state.configHistory.push(structuredClone(state.config)); state.config.reserveTasks = tasks; state.config.version++;
    return { reserveTasks: tasks, version: state.config.version };
  }
  if (command.type === 'ability_grant') {
    manage(actor); check(command.reason?.trim(), 'REASON_REQUIRED', 400);
    const definition = state.abilityCatalog.find(card => card.number === command.number);
    check(definition?.enabled && state.teams.some(team => team.id === command.teamId && !team.finishedAt), 'CARD_UNAVAILABLE');
    const card = { id: randomUUID(), number: definition.number, teamId: command.teamId, status: 'AVAILABLE', grantedAt: state.now, reason: command.reason, source: 'staff', revealedBy: [] };
    state.abilityCards.push(card); services.message(state, command.teamId, 'ability_grant', `获得能力卡：${definition.title}`, true, card.id); return { card };
  }
  if (command.type === 'ability_configure') {
    manage(actor); check(command.reason?.trim(), 'REASON_REQUIRED', 400);
    const definition = state.abilityCatalog.find(card => card.number === command.number);
    check(definition && command.patch && Object.keys(command.patch).length && Object.keys(command.patch).every(key => ['enabled', 'durationMs', 'reward', 'penalty'].includes(key)), 'CONFIG_INVALID', 400);
    for (const [key, value] of Object.entries(command.patch)) check(key === 'enabled' ? typeof value === 'boolean' : Number.isSafeInteger(value) && value >= 0 && value <= (key === 'durationMs' ? 120 * minute : 10000), 'CONFIG_INVALID', 400);
    state.abilityConfigHistory.push({ number: definition.number, before: { ...definition }, patch: command.patch, actorId: actor.id, reason: command.reason, at: state.now });
    Object.assign(definition, command.patch); return { definition };
  }
  if (command.type === 'ability_nickname') {
    check(actor.role === 'player' && typeof command.nickname === 'string' && command.nickname.trim().length > 0 && command.nickname.trim().length <= 30, 'NICKNAME_INVALID', 400);
    check(state.status === 'READY', 'NICKNAME_LOCKED_AFTER_START');
    state.accounts.find(account => account.id === actor.id).nickname = command.nickname.trim(); return { nickname: command.nickname.trim() };
  }
  if (command.type === 'ability_use') {
    check(actor.role === 'player', 'FORBIDDEN', 403); services.requireRunning(state);
    const card = state.abilityCards.find(card => card.id === command.instanceId && card.teamId === actor.teamId);
    check(card?.status === 'AVAILABLE' && state.abilityCatalog.find(def => def.number === card.number)?.enabled, 'CARD_UNAVAILABLE');
    check(!state.teams.find(team => team.id === actor.teamId)?.finishedAt, 'TEAM_FINISHED');
    const definition = structuredClone(state.abilityCatalog.find(def => def.number === card.number));
    const activeTeams = state.teams.filter(team => !team.finishedAt);
    let targets;
    if (definition.target === 'self') targets = [actor.teamId];
    else if (definition.target === 'all') targets = activeTeams.map(team => team.id);
    else if (definition.target === 'others') targets = activeTeams.filter(team => team.id !== actor.teamId).map(team => team.id);
    else if (definition.target === 'random') targets = [activeTeams[randomInt(activeTeams.length)].id];
    else if (definition.target === 'highest') {
      const max = Math.max(...state.teams.map(team => services.score(state, team.id)));
      const highest = activeTeams.filter(team => services.score(state, team.id) === max && team.id !== actor.teamId);
      check(services.score(state, actor.teamId) < max, 'CASTER_ALREADY_HIGHEST'); check(highest.length, 'HIGHEST_TEAM_UNAVAILABLE');
      check(highest.length === 1 || highest.some(team => team.id === command.targetTeamId), 'CHOOSE_TIED_HIGHEST');
      targets = [highest.find(team => team.id === command.targetTeamId)?.id ?? highest[0].id];
    } else {
      check(activeTeams.some(team => team.id === command.targetTeamId) && command.targetTeamId !== actor.teamId, 'TARGET_INVALID', 400);
      targets = [command.targetTeamId];
    }
    check(targets.length, 'TARGET_INVALID', 400);
    if (card.number === 23) { check(!state.activeAssignments[targets[0]], 'ASSIGNMENT_ALREADY_ACTIVE'); check(extraCandidates(state, targets[0]).length, 'EXTRA_TASK_UNAVAILABLE'); }
    const use = { id: randomUUID(), instanceId: card.id, number: card.number, casterTeamId: actor.teamId, actorId: actor.id, definition, targets, status: 'PENDING', createdAt: state.now, acked: [], evidence: [], results: {}, startedAt: null };
    if (card.number === 14) {
      const historic = state.locationHistory.findLast(point => point.teamId === targets[0] && point.receivedAt <= state.now - 10 * minute);
      check(historic && state.now - 10 * minute - historic.receivedAt <= 2 * minute, 'HISTORIC_LOCATION_UNAVAILABLE');
      use.returnPosition = structuredClone(historic);
    }
    if (card.number === 12) { const task = state.submissions.findLast(item => item.teamId === targets[0] && item.kind === 'task' && item.status.startsWith('APPROVED')); check(task, 'PREVIOUS_TASK_REQUIRED'); use.redoTask = { taskId: task.taskId, submissionId: task.id, points: task.taskPoints ?? (task.status === 'APPROVED_AWARDED' ? state.config.tasks.find(candidate => candidate.id === task.taskId).points : 0) }; }
    state.abilityUses.push(use); card.status = 'PENDING';
    if ([3, 8].includes(card.number)) activate(state, use, actor, services);
    else services.message(state, 'staff', 'ability', `${definition.title}等待工作人员确认`, true, use.id);
    return { use };
  }
  if (command.type === 'ability_confirm') {
    manage(actor); services.requireRunning(state);
    const use = state.abilityUses.find(use => use.id === command.useId && use.status === 'PENDING'); check(use, 'CARD_REQUEST_INVALID');
    const card = state.abilityCards.find(card => card.id === use.instanceId);
    check(['approve', 'reject'].includes(command.result), 'REVIEW_INVALID', 400);
    if (command.result === 'reject') { check(command.reason?.trim(), 'REASON_REQUIRED', 400); use.status = 'REJECTED'; card.status = 'AVAILABLE'; use.reason = command.reason; }
    else activate(state, use, actor, services);
    return { use };
  }
  const use = state.abilityUses.find(use => use.id === command.useId);
  check(use, 'ABILITY_NOT_FOUND', 404);
  if (command.type === 'ability_ack') {
    check(actor.role === 'player' && use.targets.includes(actor.teamId), 'FORBIDDEN', 403); services.requireRunning(state);
    check(['AWAITING_ACK', 'ACTIVE'].includes(use.status), 'ABILITY_NOT_ACTIVE');
    if (!use.acked.includes(actor.teamId)) {
      if (use.number === 2) { const point = state.locations[actor.teamId]; check(point && !point.restored && state.now - point.receivedAt < state.config.offlineMs, 'FRESH_LOCATION_REQUIRED'); use.anchors ??= {}; use.anchors[actor.teamId] = { ...point }; use.movementAlerts ??= []; }
      use.acked.push(actor.teamId);
    }
    if (use.targets.every(teamId => use.acked.includes(teamId))) { use.startedAt ??= gameTime(state); use.status = 'ACTIVE'; }
    return { use };
  }
  if (command.type === 'ability_submit') {
    check(actor.role === 'player' && (use.targets.includes(actor.teamId) || use.number === 1 && use.casterTeamId === actor.teamId || use.number === 19 && use.casterTeamId !== actor.teamId), 'FORBIDDEN', 403); services.requireRunning(state);
    check(abilityActive(state, use), 'ABILITY_NOT_ACTIVE');
    check(typeof command.text === 'string' && command.text.trim().length > 0 && command.text.length <= 4000, 'EVIDENCE_REQUIRED', 400);
    const evidence = { id: randomUUID(), teamId: actor.teamId, actorId: actor.id, text: command.text.trim(), submittedAt: state.now, elapsed: gameTime(state), order: ++state.sequence };
    if (use.number === 22) {
      check(!use.evidence.some(item => item.teamId === actor.teamId && item.valid), 'KEY_ALREADY_ACCEPTED');
      const canonical = evidence.text.normalize('NFKC').toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]/g, '');
      const acceptedHash = state.mode === 'live' ? 'af070c3ce548860b3cbff1ae45bd9d2f0ff2c3de0dbc249ff924c67c34b2ffdc' : state.abilityTestHash;
      evidence.valid = createHash('sha256').update(canonical).digest('hex') === acceptedHash;
      evidence.semanticReview = !evidence.valid && /[\u3400-\u9fff]/.test(canonical);
      check(evidence.valid || evidence.semanticReview, 'KEY_INCORRECT', 400);
    }
    if (use.number === 20) {
      check(Array.isArray(command.participants) && command.participants.length === 3 && new Set(command.participants).size === 3 && command.participants.every(id => state.accounts.some(account => account.id === id && account.teamId === actor.teamId)), 'THREE_MEMBERS_REQUIRED', 400);
      evidence.nicknames = command.participants.map(id => ({ accountId: id, nickname: state.accounts.find(account => account.id === id).nickname ?? state.accounts.find(account => account.id === id).username }));
    }
    if (command.media) { const media = await services.prepareMedia(state, command.media, actor.teamId); state.media[media.id] = media; evidence.mediaId = media.id; }
    use.evidence.push(evidence); services.message(state, 'staff', 'ability_evidence', '收到能力卡完成证据', true, use.id);
    return { evidence };
  }
  if (command.type === 'ability_review') {
    check(actor.role === 'staff' && actor.review && actor.manage, 'FORBIDDEN', 403); services.requireRunning(state);
    check(['ACTIVE', 'AWAITING_REVIEW'].includes(use.status) && use.targets.includes(command.teamId) && !use.results[command.teamId], 'ABILITY_REVIEW_INVALID');
    check(['approve', 'reject'].includes(command.result) && command.reason?.trim(), 'REASON_REQUIRED', 400);
    const approved = command.result === 'approve';
    if (use.number === 22) {
      const evidence = use.evidence.find(item => item.id === command.evidenceId && item.teamId === command.teamId && item.semanticReview && !item.reviewedBy);
      check(evidence, 'SEMANTIC_EVIDENCE_REQUIRED'); evidence.valid = approved; evidence.reviewedBy = actor.id; evidence.reviewReason = command.reason; return { use };
    }
    if (use.number === 15) check(!approved, 'USE_TASK_SWAP_COMMAND');
    if (use.number === 20 && approved) check(use.evidence.some(item => item.nicknames?.length === 3), 'NICKNAME_EVIDENCE_REQUIRED');
    if (use.number === 19 && !approved) check(use.evidence.some(item => item.teamId !== use.casterTeamId && item.mediaId), 'TOUCH_EVIDENCE_REQUIRED');
    if (approved && [4, 6, 11, 12, 13, 14, 20, 21].includes(use.number) && !abilityActive(state, use)) check(use.evidence.some(item => item.teamId === command.teamId) || command.completedInTime === true, 'TIMELY_COMPLETION_REQUIRED');
    const sustained = [2, 7, 9, 10, 16, 17, 18, 19, 24].includes(use.number);
    check(!approved || !sustained || gameTime(state) - use.startedAt >= use.definition.durationMs, 'DURATION_NOT_FINISHED');
    let points = approved ? 0 : -use.definition.penalty;
    if (use.number === 6) {
      const members = state.accounts.filter(account => account.teamId === command.teamId && account.role === 'player');
      check(command.counts && Object.keys(command.counts).length === members.length && members.every(member => Number.isSafeInteger(command.counts[member.id]) && command.counts[member.id] >= 0 && command.counts[member.id] <= 20), 'COUNTS_REQUIRED', 400);
      points = -members.reduce((missing, member) => missing + 20 - command.counts[member.id], 0) * use.definition.penalty;
    }
    if (use.number === 1 && approved) {
      check(use.evidence.some(item => item.mediaId), 'PHOTO_REQUIRED');
      const difference = services.score(state, command.teamId) - services.score(state, use.casterTeamId);
      services.credit(state, use.casterTeamId, difference, 'ABILITY', use.id, actor, command.reason); points = -difference;
    }
    if ([19, 20].includes(use.number) && approved) points = use.definition.reward;
    if (use.number === 12 && approved) { check(use.evidence.some(item => item.teamId === command.teamId && item.mediaId), 'REDO_EVIDENCE_REQUIRED'); points = use.redoTask.points * 0.5; }
    if (use.number === 23 && approved) {
      check(use.evidence.some(item => item.teamId === command.teamId && item.mediaId), 'EXTRA_TASK_EVIDENCE_REQUIRED');
      points = use.definition.reward;
    }
    if (use.number === 21) { check(Number.isSafeInteger(command.verifiedDigits) && command.verifiedDigits >= 0, 'DIGIT_COUNT_REQUIRED', 400); points = approved ? command.verifiedDigits : 0; }
    services.credit(state, command.teamId, points, 'ABILITY', use.id, actor, command.reason);
    use.results[command.teamId] = { approved, points, counts: command.counts, verifiedDigits: command.verifiedDigits, reason: command.reason, actorId: actor.id, at: state.now };
    if (use.number === 23 && state.activeAssignments[command.teamId]?.useId === use.id) delete state.activeAssignments[command.teamId];
    if (use.targets.every(teamId => use.results[teamId])) use.status = 'DONE';
    services.message(state, command.teamId, 'ability_result', `${use.definition.title}结算 ${points} 分：${command.reason}`, true, use.id);
    return { use, points };
  }
  if (command.type === 'ability_swap') {
    check(actor.role === 'player' && use.targets.includes(actor.teamId), 'FORBIDDEN', 403); services.requireRunning(state);
    check(use.number === 15 && abilityActive(state, use), 'ABILITY_NOT_ACTIVE');
    const peer = state.teams.find(team => team.id === command.peerTeamId && team.id !== actor.teamId && !team.finishedAt);
    const own = state.teams.find(team => team.id === actor.teamId);
    check(peer && own.regionId && peer.regionId, 'TARGET_INVALID');
    check(!state.activeAssignments[own.id] && !state.activeAssignments[peer.id], 'ASSIGNMENT_ALREADY_ACTIVE');
    check(command.ownTaskId !== command.peerTaskId && [command.ownTaskId, command.peerTaskId].every(taskId => state.config.tasks.some(task => task.id === taskId) && !state.awards[taskId] && !Object.values(state.activeAssignments).some(item => item.taskId === taskId) && !state.submissions.some(item => item.taskId === taskId && item.status === 'QUEUED')), 'TASK_SWAP_INVALID');
    state.activeAssignments[own.id] = { taskId: command.peerTaskId, useId: use.id, regionId: own.regionId };
    state.activeAssignments[peer.id] = { taskId: command.ownTaskId, useId: use.id, regionId: peer.regionId };
    use.status = 'DONE'; use.swap = { ownTeamId: own.id, peerTeamId: peer.id, ownTaskId: command.ownTaskId, peerTaskId: command.peerTaskId };
    for (const teamId of [own.id, peer.id]) services.message(state, teamId, 'ability_swap', `下一任务交换为 ${state.activeAssignments[teamId].taskId}`, true, use.id);
    return { use };
  }
  if (command.type === 'ability_settle') {
    manage(actor); services.requireRunning(state); check(use.number === 22 && ['ACTIVE', 'AWAITING_REVIEW'].includes(use.status) && command.reason?.trim(), 'ABILITY_SETTLE_INVALID');
    const valid = use.targets.map(teamId => ({ teamId, evidence: use.evidence.filter(item => item.teamId === teamId && item.valid).sort((a, b) => a.order - b.order)[0] }));
    check(!abilityActive(state, use) || valid.every(item => item.evidence), 'RACE_STILL_RUNNING');
    check(!use.evidence.some(item => item.semanticReview && !item.reviewedBy), 'SEMANTIC_REVIEW_PENDING');
    const ordered = valid.filter(item => item.evidence).sort((a, b) => a.evidence.order - b.evidence.order);
    const absent = valid.filter(item => !item.evidence);
    const slowest = absent.length ? absent.map(item => item.teamId) : ordered.length > 1 ? [ordered.at(-1).teamId] : [];
    for (const target of use.targets) {
      const points = (target === ordered[0]?.teamId ? use.definition.reward : 0) - (slowest.includes(target) ? use.definition.penalty : 0);
      services.credit(state, target, points, 'ABILITY', use.id, actor, command.reason);
      use.results[target] = { points, actorId: actor.id, reason: command.reason, at: state.now };
      services.message(state, target, 'ability_result', `密钥竞速结算 ${points} 分`, true, use.id);
    }
    use.status = 'DONE'; return { use };
  }
  if (command.type === 'ability_cancel') {
    check(actor.manage || use.casterTeamId === actor.teamId, 'FORBIDDEN', 403); check(use.status === 'PENDING' && command.reason?.trim(), 'ABILITY_CANCEL_INVALID');
    use.status = 'CANCELLED'; use.reason = command.reason; state.abilityCards.find(card => card.id === use.instanceId).status = 'AVAILABLE'; return { use };
  }
  if (command.type === 'ability_abort') {
    manage(actor); check(['AWAITING_ACK', 'ACTIVE', 'AWAITING_REVIEW'].includes(use.status) && command.reason?.trim(), 'ABILITY_CANCEL_INVALID');
    use.status = 'CANCELLED'; use.reason = command.reason; use.closedBy = actor.id;
    for (const [teamId, assignment] of Object.entries(state.activeAssignments)) if (assignment.useId === use.id) delete state.activeAssignments[teamId];
    for (const teamId of use.targets) services.message(state, teamId, 'ability_cancelled', `${use.definition.title}已由工作人员终止：${command.reason}`, true, use.id);
    return { use };
  }
  check(false, 'COMMAND_UNKNOWN', 400);
}

function activate(state, use, actor, services) {
  if (use.number === 23) {
    const teamId = use.targets[0]; services.requireRule(!state.activeAssignments[teamId], 'ASSIGNMENT_ALREADY_ACTIVE');
    const pool = extraCandidates(state, teamId); services.requireRule(pool.length, 'EXTRA_TASK_UNAVAILABLE');
    use.extraTask = structuredClone(pool[randomInt(pool.length)]);
    state.abilityExtraDraws.push({ teamId, taskId: use.extraTask.id, useId: use.id, at: state.now });
    state.activeAssignments[teamId] = { kind: 'extra', taskId: use.extraTask.id, useId: use.id, task: use.extraTask };
  }
  const card = state.abilityCards.find(card => card.id === use.instanceId); card.status = 'USED';
  use.confirmedBy = actor.id; use.confirmedAt = state.now;
  if ([3, 8].includes(use.number)) { use.status = 'ACTIVE'; use.startedAt = gameTime(state); }
  else if (use.number === 5) {
    const highest = Math.max(...state.teams.map(team => services.score(state, team.id)));
    services.requireRule(services.score(state, use.targets[0]) === highest && services.score(state, use.casterTeamId) < highest, 'HIGHEST_CHANGED');
    services.credit(state, use.targets[0], -use.definition.reward, 'ABILITY', use.id, actor, '榜首援助转出');
    services.credit(state, use.casterTeamId, use.definition.reward, 'ABILITY', use.id, actor, '榜首援助转入'); use.status = 'DONE';
  } else use.status = 'AWAITING_ACK';
  for (const teamId of [...new Set([...use.targets, use.casterTeamId])]) services.message(state, teamId, 'ability', use.definition.description, true, use.id);
}

const distance = (a, b) => { const radians = Math.PI / 180; const h = Math.sin((a.latitude - b.latitude) * radians / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin((a.longitude - b.longitude) * radians / 2) ** 2; return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h))); };
export function abilityLocation(state, teamId, position, services) {
  for (const use of state.abilityUses ?? []) if (use.number === 2 && use.targets.includes(teamId) && abilityActive(state, use)) {
    const anchor = use.anchors[teamId]; const moved = distance(anchor, position); const tolerance = Math.max(25, anchor.accuracy + position.accuracy);
    if (moved > tolerance) { use.movementAlerts.push({ teamId, distance: Math.round(moved), tolerance, at: state.now }); services.message(state, 'staff', 'ability_movement', '冻结队伍出现 GPS 位移，请人工核实', true, use.id); }
  }
}
