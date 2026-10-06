import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { normalizeBingoTasks } from './bingoBoards.mjs';
import { bingoSlotForTask } from './bingoBoards.mjs';
import { approvePhotoFind, photoFindsEnabled, photoFindStatus, taskIsRevealed, validPhotoSlot } from './photoFinds.mjs';
import { officialScoring, validateFinishRewards, finishAward } from './scoring.mjs';
import { abilityCommand, abilityView, abilityTick, abilityScoreAccess, abilityLocation, abilityResultView, taskPermissions, abilityTaskReviewed, validateReserveTasks } from './abilityCards.mjs';

export class RuleError extends Error {
  constructor(code, message = code, statusCode = 409) { super(message); this.code = code; this.statusCode = statusCode; }
}
const requireRule = (valid, code, status = 409) => { if (!valid) throw new RuleError(code, code, status); };
const manage = actor => requireRule(actor.role === 'staff' && actor.manage, 'FORBIDDEN', 403);
const teamFor = (state, actor) => state.teams.find(team => team.id === actor.teamId);
const requireRunning = state => requireRule(state.status === 'RUNNING', state.status === 'PAUSED' ? 'GAME_PAUSED' : 'GAME_NOT_RUNNING');
const elapsed = state => state.elapsedMs + (state.status === 'RUNNING' ? state.now - state.runningSince : 0);
const hash = value => createHash('sha256').update(value).digest('hex');

export function seedState(accounts) {
  return {
    schemaVersion: 1, accounts, status: 'READY', now: Date.now(), virtualTime: Date.now(), elapsedMs: 0, runningSince: null, sequence: 0,
    config: { version: 1, regions: ['stage-a', 'stage-b', 'stage-c'], taskLimit: 5, rankingIntervalMs: 2400000, rankingVisibleMs: 120000, locationIntervalMs: 3000, offlineMs: 20000, sampleMs: 60000, mediaLimitBytes: 8388608, storageWarnBytes: 800000000,
      tasks: Array.from({ length: 25 }, (_, index) => ({ id: `T${String(index + 1).padStart(2, '0')}`, title: `测试任务 ${index + 1}`, points: 5, brief: '提交一张现场原图', image: '/hrg-mark.svg' })),
      boardRewards: [{ tasks: ['T02', 'T03', 'T04'], points: 10 }], finishPoints: 0,
      eventTemplates: [{ id: 'score-event', effect: 'score', amount: 2 }]
    },
    configHistory: [], teams: [{ id: 'team-1', name: '测试一队', regionId: null, regionVersion: 0, finishedAt: null }, { id: 'team-2', name: '测试二队', regionId: null, regionVersion: 0, finishedAt: null }],
    submissions: [], awards: {}, media: {}, ledger: [], events: [], cards: [{ id: 'boost', teamId: 'team-1', uses: 1, effect: 'score', amount: 3, target: 'self', needsConfirmation: false }, { id: 'scan', teamId: 'team-1', uses: 1, effect: 'score_access', durationMs: 300000, target: 'other', needsConfirmation: false }, { id: 'jam', teamId: 'team-1', uses: 1, effect: 'restriction', durationMs: 300000, target: 'other', needsConfirmation: true }],
    cardRequests: [], effects: [], locations: {}, locationHistory: [], snapshots: [], messages: [], challenges: [], audit: [], idempotency: {}
  };
}

function credit(state, teamId, points, category, reference, actor, reason) {
  const id = `${category}:${reference}:${teamId}`;
  if (state.ledger.some(entry => entry.id === id)) return;
  state.ledger.push({ id, teamId, points, category, reference, actor: actor.id, reason, at: state.now });
}
const score = (state, teamId) => Math.round(state.ledger.filter(entry => entry.teamId === teamId).reduce((sum, entry) => sum + entry.points, 0) * 1e6) / 1e6;
function ranking(state) {
  const entries = state.teams.map(team => ({ teamId: team.id, name: team.name, score: score(state, team.id), taskScore: state.ledger.filter(entry => entry.teamId === team.id && entry.category === 'TASK').reduce((sum, entry) => sum + entry.points, 0), finishedAt: team.finishedAt }))
    .sort((a, b) => b.score - a.score || b.taskScore - a.taskScore || (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity));
  let rank = 0;
  return entries.map((entry, index) => { const previous = entries[index - 1]; if (!previous || previous.score !== entry.score || previous.taskScore !== entry.taskScore || previous.finishedAt !== entry.finishedAt) rank = index + 1; return { ...entry, rank }; });
}
function message(state, teamId, type, text, pushEligible = false, reference = null, extra = null) {
  const item = { id: ++state.sequence, teamId, type, text, pushEligible, pushStatus: pushEligible ? 'unconfigured' : 'not-required', at: state.now, reference, readBy: [], playedBy: [], ...(extra ?? {}) };
  state.messages.push(item);
  return item;
}
/** 特殊人物（线下工作人员）需要知道当前分数最低的未完赛队伍。并列时取先出现的一支。 */
function lowestScoringTeamId(state) {
  const active = state.teams.filter(team => team.finishedAt == null);
  return active.length ? active.reduce((lowest, team) => score(state, team.id) < score(state, lowest.id) ? team : lowest, active[0]).id : null;
}
function locationView(state, team) {
  const position = state.locations[team.id];
  return { teamId: team.id, name: team.name, ...(position ?? {}), status: team.finishedAt ? 'finished' : position && !position.restored && state.now - position.receivedAt < state.config.offlineMs ? 'online' : 'offline', color: team.finishedAt ? '#f6c84f' : '#c8ff32', finishedAt: team.finishedAt };
}
export function tick(state, issueCards = true) {
  state.now = state.virtualTime ?? Date.now();
  abilityTick(state, issueCards ? { message } : undefined);
  const period = Math.floor(elapsed(state) / state.config.rankingIntervalMs);
  if (period > 0 && !state.snapshots.some(snapshot => snapshot.period === period)) state.snapshots.push({ period, at: state.now, elapsed: period * state.config.rankingIntervalMs, ranking: ranking(state) });
}
function activeEffect(state, effect) { return effect.startedAt != null && elapsed(state) - effect.startedAt < effect.durationMs; }
export function stateView(state, actor) {
  tick(state);
  const lastSnapshot = state.snapshots.at(-1);
  const snapshot = lastSnapshot && elapsed(state) - lastSnapshot.elapsed < state.config.rankingVisibleMs ? lastSnapshot : null;
  const taskCatalog = actor.role === 'staff' && (actor.manage || actor.review) ? { taskCatalog: state.config.tasks, boardRewards: state.config.boardRewards } : {};
  const common = { ...taskCatalog, ...abilityView(state, actor), taskPermissions: taskPermissions(state, actor.teamId), liveRanking: actor.manage || abilityScoreAccess(state, actor.teamId) ? ranking(state) : null, status: state.status, elapsedMs: elapsed(state), serverTime: state.now, configVersion: state.config.version, scoringVersion: state.config.scoringVersion, taskLimit: state.config.taskLimit, finishRewards: state.config.finishRewards, rankingSnapshot: snapshot, lastEventId: state.sequence };
  if (actor.role === 'staff') {
    if (!actor.manage && !actor.review) return { ...common, locations: actor.locations ? state.teams.map(team => locationView(state, team)) : [] };
    const metadata = JSON.stringify({ ...state, media: Object.fromEntries(Object.entries(state.media).map(([id, media]) => [id, { ...media, base64: undefined, thumbnail: undefined }])) });
    return { ...common, teams: state.teams.map(team => ({ ...team, score: score(state, team.id) })), allFinished: state.teams.every(team => team.finishedAt != null), queue: state.submissions.filter(item => item.status === 'QUEUED'), submissions: state.submissions, awards: state.awards, ledger: state.ledger, events: state.events, cardRequests: state.cardRequests, effects: state.effects, snapshots: state.snapshots, challenges: state.challenges ?? [], lowestTeamId: lowestScoringTeamId(state), audit: state.audit, locations: actor.locations ? state.teams.map(team => locationView(state, team)) : undefined, locationHistory: actor.locations ? state.locationHistory : undefined, storage: { metadataBytes: Buffer.byteLength(metadata), warning: Buffer.byteLength(metadata) >= state.config.storageWarnBytes }, finishBlockers: { queued: state.submissions.filter(item => item.status === 'QUEUED').length, pendingCards: state.cardRequests.filter(item => item.status === 'PENDING').length } };
  }
  const team = teamFor(state, actor);
  const photoGate = photoFindsEnabled(state);
  const tasks = state.config.tasks.map(task => {
    const slot = photoGate ? bingoSlotForTask(state, task) : task.sharedSlot ?? task.id;
    const taskUnlocked = taskIsRevealed(state, team, task);
    return { id: task.id, boardId: task.boardId, image: task.image, sharedSlot: slot,
      ...(photoGate || team.regionId ? { points: task.points, difficulty: task.difficulty } : {}), taskUnlocked,
      photoStatus: photoGate && validPhotoSlot(slot) ? photoFindStatus(state, team.id, team.regionId, slot) : undefined,
      awarded: !!state.awards[task.id], pendingCount: state.submissions.filter(item => item.taskId === task.id && item.status === 'QUEUED').length,
      ...(taskUnlocked ? { title: task.title, brief: task.brief, bonus: task.bonus, failurePenalty: task.failurePenalty } : {}) };
  });
  return { ...common, team: { ...team, score: score(state, team.id) }, tasks, submissions: state.submissions.filter(item => item.teamId === team.id), cards: state.cards.filter(card => card.teamId === team.id), events: state.events.filter(event => event.teamId === team.id), effects: state.effects.filter(effect => effect.teamId === team.id), challenges: (state.challenges ?? []).filter(item => item.teamId === team.id), location: locationView(state, team) };
}
export function visibleMessages(state, actor, after = 0) {
  return state.messages.filter(item => item.id > after && (item.teamId === actor.teamId || item.teamId === 'all' || (item.teamId === 'staff' && actor.review)))
    .map(item => ({ ...item, read: item.readBy.includes(actor.id), readBy: undefined, playedBy: undefined }));
}
export function allowedScore(state, actor, target) {
  tick(state, false);
  requireRule(actor.manage || target === actor.teamId || abilityScoreAccess(state, actor.teamId) || state.effects.some(effect => effect.effect === 'score_access' && effect.viewerTeamId === actor.teamId && effect.teamId === target && activeEffect(state, effect)), 'FORBIDDEN', 403);
  requireRule(state.teams.some(team => team.id === target), 'TEAM_NOT_FOUND', 404);
  return { teamId: target, score: score(state, target) };
}
export function visibleMedia(state, actor, id) {
  const media = state.media[id];
  requireRule(media && (actor.review || media.teamId === actor.teamId), 'FORBIDDEN', 403);
  return media;
}

async function prepareMedia(state, input, teamId, video = false) {
  requireRule(input && typeof input.base64 === 'string' && input.base64.length < Math.ceil(state.config.mediaLimitBytes * 4 / 3) + 8 && typeof input.name === 'string' && !/[\\/\x00]/.test(input.name), 'MEDIA_INVALID', 400);
  requireRule(['image/png', 'image/jpeg', 'image/webp', ...(video ? ['video/mp4', 'video/webm'] : [])].includes(input.mime) && /^[a-zA-Z0-9+/]*={0,2}$/.test(input.base64), 'MEDIA_INVALID', 400);
  const bytes = Buffer.from(input.base64, 'base64');
  requireRule(bytes.length > 0 && bytes.length <= state.config.mediaLimitBytes, 'MEDIA_INVALID', 400);
  if (input.mime.startsWith('video/')) {
    requireRule(bytes.length > 32 && (input.mime === 'video/mp4' ? bytes.subarray(4, 8).toString('ascii') === 'ftyp' : bytes.subarray(0, 4).toString('hex') === '1a45dfa3'), 'MEDIA_INVALID', 400);
    return { id: randomUUID(), teamId, mime: input.mime, name: input.name, bytes: bytes.length, sha256: hash(bytes), base64: input.base64 };
  }
  let metadata, thumbnail;
  try { metadata = await sharp(bytes, { limitInputPixels: 40000000 }).metadata(); thumbnail = await sharp(bytes, { limitInputPixels: 40000000 }).resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp().toBuffer(); }
  catch { throw new RuleError('MEDIA_INVALID', '影像文件损坏', 400); }
  requireRule(({ png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' })[metadata.format] === input.mime, 'MEDIA_INVALID', 400);
  return { id: randomUUID(), teamId, mime: input.mime, name: input.name, bytes: bytes.length, sha256: hash(bytes), base64: input.base64, thumbnail: thumbnail.toString('base64') };
}

function applyEffect(state, source, target, actor, category) {
  requireRule(state.teams.some(team => team.id === target), 'TARGET_INVALID', 400);
  if (source.effect === 'score') credit(state, target, source.amount, category, source.id, actor, '配置化测试效果');
  else state.effects.push({ id: randomUUID(), source: source.id, teamId: target, viewerTeamId: actor.teamId, effect: source.effect, durationMs: source.durationMs, startedAt: source.effect === 'restriction' ? null : elapsed(state) });
  message(state, target, category.toLowerCase(), '收到活动效果', true, source.id);
}

export async function executeCommand(state, actor, command, key) {
  tick(state);
  requireRule(typeof key === 'string' && key.length >= 8 && key.length <= 160, 'IDEMPOTENCY_KEY_REQUIRED', 400);
  requireRule(command && typeof command.type === 'string', 'COMMAND_INVALID', 400);
  const keyId = `${actor.id}:${key}`; const fingerprint = hash(JSON.stringify(command));
  if (state.idempotency[keyId]) { requireRule(state.idempotency[keyId].fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT'); return state.idempotency[keyId].result; }
  const before = { status: state.status, configVersion: state.config.version, ledgerCount: state.ledger.length, submissionCount: state.submissions.length };
  let result;
  if (command.type === 'game_configure' || command.type === 'scoring_preset') {
    manage(actor); requireRule(state.mode === 'live' && state.status === 'READY' && command.reason?.trim(), 'CONFIG_INVALID', 400);
    const input = command.type === 'scoring_preset' ? officialScoring : command;
    const tasks = normalizeBingoTasks(input.tasks, requireRule);
    const rewards = input.boardRewards ?? [];
    const finishRewards = input.finishRewards == null ? state.config.finishRewards : validateFinishRewards(input.finishRewards, requireRule);
    const reserveTasks = validateReserveTasks(command.reserveTasks ?? state.config.reserveTasks ?? [], tasks, requireRule);
    requireRule(Array.isArray(rewards) && rewards.every(reward => Array.isArray(reward.tasks) && reward.tasks.length && reward.tasks.every(id => tasks.some(task => task.id === id)) && Number.isSafeInteger(reward.points) && reward.points >= 0 && reward.points <= 10000), 'REWARD_CONFIG_INVALID', 400);
    state.configHistory.push(structuredClone(state.config)); state.config.tasks = tasks; state.config.reserveTasks = reserveTasks; state.config.boardRewards = rewards; state.config.finishRewards = finishRewards; state.config.scoringVersion = command.type === 'scoring_preset' ? officialScoring.version : 'custom';
    if (command.type === 'scoring_preset') state.config.taskLimit = officialScoring.taskLimit;
    state.config.version++; state.configured = true;
    result = { configured: true, version: state.config.version };
  } else if (command.type.startsWith('ability_')) {
    result = abilityResultView(await abilityCommand(state, actor, command, { requireRule, manage, requireRunning, elapsed, score, credit, message, ranking, prepareMedia: (state, input, teamId) => prepareMedia(state, input, teamId, true) }), actor);
  } else if (command.type === 'transition') {
    manage(actor);
    const transitions = { READY: ['RUNNING'], RUNNING: ['PAUSED', 'FINISHED'], PAUSED: ['RUNNING', 'FINISHED'], FINISHED: [] };
    requireRule(transitions[state.status]?.includes(command.status), 'INVALID_TRANSITION');
    if (state.mode === 'live' && command.status === 'RUNNING') requireRule(state.configured, 'GAME_CONFIG_REQUIRED');
    if (command.status === 'FINISHED') requireRule(!state.abilityUses.some(use => ['PENDING', 'AWAITING_ACK', 'AWAITING_REVIEW'].includes(use.status) || use.status === 'ACTIVE' && ![3, 8].includes(use.number)), 'ABILITY_FINISH_BLOCKED');
    if (command.status === 'FINISHED') requireRule(!state.submissions.some(item => item.status === 'QUEUED') && !state.cardRequests.some(item => item.status === 'PENDING'), 'FINISH_BLOCKED');
    if (state.status === 'RUNNING') state.elapsedMs = elapsed(state);
    state.status = command.status; state.runningSince = command.status === 'RUNNING' ? state.now : null;
    if (command.status === 'FINISHED') for (const use of state.abilityUses.filter(use => use.status === 'ACTIVE')) use.status = 'DONE';
    message(state, 'all', 'game', command.status, true);
    result = { status: state.status };
  } else if (command.type === 'submit') {
    requireRule(actor.role === 'player', 'FORBIDDEN', 403); requireRunning(state);
    const team = teamFor(state, actor); requireRule(!team.finishedAt, 'TEAM_FINISHED');
    if (command.kind === 'task') { requireRule(!taskPermissions(state, team.id).blockedBy.length, 'TASK_RESTRICTED'); requireRule(!state.activeAssignments[team.id] || state.activeAssignments[team.id].taskId === command.taskId, 'ASSIGNED_TASK_REQUIRED'); }
    else if (command.kind !== 'photo') requireRule(!state.activeAssignments[team.id], 'ASSIGNED_TASK_REQUIRED');
    const regionIndex = state.config.regions.indexOf(command.regionId); requireRule(regionIndex >= 0, 'REGION_INVALID', 400);
    if (command.kind === 'arrival') requireRule(regionIndex === (team.regionId ? state.config.regions.indexOf(team.regionId) + 1 : 0), 'REGION_ORDER_INVALID');
    else if (command.kind === 'photo') {
      requireRule(team.regionId === command.regionId, 'REGION_NOT_UNLOCKED');
      requireRule(photoFindsEnabled(state) && validPhotoSlot(command.photoSlot) && state.config.tasks.some(task => bingoSlotForTask(state, task) === command.photoSlot), 'PHOTO_SLOT_INVALID', 400);
      const photoStatus = photoFindStatus(state, team.id, command.regionId, command.photoSlot);
      requireRule(photoStatus !== 'approved', 'PHOTO_ALREADY_APPROVED');
      requireRule(photoStatus !== 'pending', 'PHOTO_REVIEW_PENDING');
    } else {
      requireRule(command.kind === 'task' && team.regionId === command.regionId, 'REGION_NOT_UNLOCKED');
      const task = state.config.tasks.find(task => task.id === command.taskId); requireRule(task, 'TASK_INVALID', 400);
      requireRule(taskIsRevealed(state, team, task), 'PHOTO_FIND_REQUIRED');
      requireRule(!state.effects.some(effect => effect.teamId === team.id && effect.effect === 'restriction' && activeEffect(state, effect)), 'TASK_RESTRICTED');
    }
    const media = await prepareMedia(state, command.media, team.id, command.kind === 'task');
    const item = { id: randomUUID(), order: ++state.sequence, submittedAt: state.now, teamId: team.id, regionId: command.regionId, kind: command.kind, taskId: command.kind === 'task' ? command.taskId : null, ...(command.kind === 'photo' ? { photoSlot: command.photoSlot } : {}), mediaId: media.id, status: 'QUEUED' };
    state.media[media.id] = media; state.submissions.push(item); message(state, 'staff', 'review_queue', '新增待审核项目', true, item.id);
    result = { code: 'SUBMITTED', submission: item, media: { id: media.id, sha256: media.sha256 } };
  } else if (command.type === 'review') {
    requireRule(actor.role === 'staff' && actor.review, 'FORBIDDEN', 403); requireRule(['RUNNING', 'PAUSED'].includes(state.status), 'GAME_NOT_REVIEWABLE');
    const item = state.submissions.find(candidate => candidate.status === 'QUEUED');
    requireRule(item?.id === command.submissionId, 'FIFO_REQUIRED'); requireRule(['approve', 'reject'].includes(command.result), 'REVIEW_INVALID', 400);
    requireRule(command.result !== 'reject' || typeof command.reason === 'string' && command.reason.trim().length > 0, 'REASON_REQUIRED', 400);
    const team = state.teams.find(candidate => candidate.id === item.teamId);
    const task = item.kind === 'task' ? state.config.tasks.find(candidate => candidate.id === item.taskId) : null;
    const failedAttempts = command.failedAttempts ?? 0;
    requireRule(Number.isSafeInteger(failedAttempts) && failedAttempts >= 0 && failedAttempts <= 100 && (failedAttempts === 0 || task?.failurePenalty && command.reason?.trim()), 'TASK_ATTEMPTS_INVALID', 400);
    requireRule(command.performanceScore == null || task?.bonus && Number.isSafeInteger(command.performanceScore) && command.performanceScore >= 0 && command.reason?.trim(), 'TASK_PERFORMANCE_INVALID', 400);
    if (command.result === 'reject') item.status = 'REJECTED_RESUBMIT';
    else if (item.kind === 'arrival') {
      requireRule(!team.finishedAt, 'TEAM_FINISHED');
      requireRule(state.config.regions.indexOf(item.regionId) === (team.regionId ? state.config.regions.indexOf(team.regionId) + 1 : 0), 'REGION_ORDER_INVALID');
      team.regionId = item.regionId; team.regionVersion += 1; item.status = 'APPROVED';
      if (!state.events.some(event => event.teamId === team.id && event.regionId === item.regionId)) state.events.push({ id: randomUUID(), teamId: team.id, regionId: item.regionId, status: 'PENDING', draws: 0, candidate: null });
    } else if (item.kind === 'photo') {
      approvePhotoFind(state, item, actor);
    } else {
      const count = Object.values(state.awards).filter(award => award.teamId === team.id && award.regionId === item.regionId).length;
      if (!state.awards[item.taskId] && count < state.config.taskLimit) {
        state.awards[item.taskId] = { teamId: team.id, regionId: item.regionId, submissionId: item.id }; item.status = 'APPROVED_AWARDED';
        credit(state, team.id, task.points, 'TASK', task.id, actor, '最早有效提交');
        if (task.bonus && command.performanceScore >= task.bonus.threshold) credit(state, team.id, task.bonus.points, 'TASK_BONUS', task.id, actor, command.reason);
        for (let index = 0; index < state.config.boardRewards.length; index++) {
          const reward = state.config.boardRewards[index];
          if (reward.tasks.every(id => state.awards[id]?.teamId === team.id)) credit(state, team.id, reward.points, 'BOARD', String(index), actor, '配置化棋盘奖励');
        }
      } else item.status = 'APPROVED_NON_SCORING';
    }
    if (failedAttempts) credit(state, team.id, -task.failurePenalty * failedAttempts, 'TASK_PENALTY', `review:${item.id}`, actor, command.reason);
    item.failedAttempts = failedAttempts; if (command.performanceScore != null) item.performanceScore = command.performanceScore;
    item.reviewedAt = state.now; item.operatorId = actor.id; item.reason = command.reason ?? '';
    abilityTaskReviewed(state, item, { message });
    message(state, team.id, 'review', item.kind === 'photo' ? (item.status === 'APPROVED' ? `图寻 #${Number(item.photoSlot.slice(1))} 已通过，对应任务已解锁。` : '图寻已打回，请重新复刻参考图的地点与拍摄角度。') : item.status, true, item.id); result = { submission: item };
  } else if (command.type === 'use_card') {
    requireRule(actor.role === 'player', 'FORBIDDEN', 403); requireRunning(state); requireRule(!teamFor(state, actor).finishedAt, 'TEAM_FINISHED');
    const card = state.cards.find(candidate => candidate.id === command.cardId && candidate.teamId === actor.teamId);
    requireRule(card?.uses > 0 && !state.cardRequests.some(item => item.cardId === card.id && item.status === 'PENDING'), 'CARD_UNAVAILABLE');
    const target = command.targetTeamId; requireRule(card.target === 'self' ? target === actor.teamId : target !== actor.teamId, 'TARGET_INVALID', 400);
    requireRule(state.teams.some(team => team.id === target), 'TARGET_INVALID', 400);
    if (card.needsConfirmation) {
      const pending = { id: randomUUID(), cardId: card.id, target, actorId: actor.id, status: 'PENDING' }; state.cardRequests.push(pending); result = { pending };
    } else { card.uses--; applyEffect(state, card, target, actor, 'CARD'); result = { used: true }; }
  } else if (command.type === 'confirm_card') {
    manage(actor); requireRunning(state);
    const pending = state.cardRequests.find(item => item.id === command.requestId && item.status === 'PENDING'); requireRule(pending, 'CARD_REQUEST_INVALID');
    const card = state.cards.find(item => item.id === pending.cardId); requireRule(card.uses > 0, 'CARD_UNAVAILABLE');
    if (command.result === 'reject') { requireRule(command.reason?.trim(), 'REASON_REQUIRED', 400); pending.status = 'REJECTED'; }
    else { requireRule(command.result === 'approve', 'REVIEW_INVALID', 400); card.uses--; pending.status = 'CONFIRMED'; applyEffect(state, card, pending.target, state.accounts.find(item => item.id === pending.actorId), 'CARD'); }
    result = { pending };
  } else if (command.type === 'event_create') {
    manage(actor); requireRunning(state);
    const title = typeof command.title === 'string' ? command.title.trim() : '';
    const description = typeof command.description === 'string' ? command.description.trim() : '';
    requireRule(title.length > 0 && title.length <= 100 && description.length > 0 && description.length <= 2000, 'EVENT_INVALID', 400);
    requireRule(Number.isSafeInteger(command.rewardPoints) && command.rewardPoints >= 0 && command.rewardPoints <= 10000, 'EVENT_INVALID', 400);
    requireRule(state.teams.some(team => team.id === command.targetTeamId), 'TARGET_INVALID', 400);
    // 现场创作没有预设模板，直接把内容固定成候选，复用既有 event_confirm 的发放与账本幂等。
    const id = randomUUID();
    const event = { id, teamId: command.targetTeamId, regionId: null, status: 'PENDING', draws: 0, title, description, rewardPoints: command.rewardPoints, candidate: { id, effect: 'score', amount: command.rewardPoints, title, description }, createdBy: actor.id, createdAt: state.now };
    state.events.push(event); result = { event };
  } else if (command.type === 'event_draw' || command.type === 'event_confirm') {
    manage(actor); requireRunning(state);
    const event = state.events.find(item => item.id === command.eventId && item.status === 'PENDING'); requireRule(event, 'EVENT_INVALID');
    if (command.type === 'event_draw') {
      if (event.draws > 0) requireRule(command.reason?.trim(), 'REASON_REQUIRED', 400);
      const templates = state.config.eventTemplates; requireRule(templates.length, 'EVENT_NOT_CONFIGURED');
      event.candidate = { ...templates[Math.floor(Math.random() * templates.length)], id: event.id }; event.draws++; result = { event };
    } else {
      requireRule(event.candidate, 'EVENT_NOT_DRAWN');
      const target = command.targetTeamId ?? event.teamId;
      const targets = target === 'all' ? state.teams.map(team => team.id) : [target];
      targets.forEach(item => applyEffect(state, event.candidate, item, actor, 'EVENT')); event.status = 'ISSUED'; result = { event };
    }
  } else if (command.type === 'send_message') {
    requireRule(actor.role === 'player', 'FORBIDDEN', 403); requireRunning(state);
    const team = teamFor(state, actor); requireRule(team, 'TEAM_NOT_FOUND', 404); requireRule(!team.finishedAt, 'TEAM_FINISHED');
    requireRule(command.recipient === 'staff', 'RECIPIENT_INVALID', 400);
    const text = typeof command.text === 'string' ? command.text.trim() : '';
    requireRule(text.length > 0 && text.length <= 2000, 'MESSAGE_INVALID', 400);
    // 收件人固定为工作人员；发送方队伍写进 reference 与 fromTeamId，供工作人员界面显示来源。
    const item = message(state, 'staff', 'player_text', text, true, team.id, { fromTeamId: team.id, fromAccountId: actor.id });
    result = { message: { id: item.id, text: item.text, teamId: team.id, at: item.at } };
  } else if (command.type === 'send_challenge') {
    manage(actor); requireRunning(state);
    const teamId = command.teamId;
    requireRule(state.teams.some(team => team.id === teamId), 'TARGET_INVALID', 400);
    const title = typeof command.title === 'string' ? command.title.trim() : '';
    const description = typeof command.description === 'string' ? command.description.trim() : '';
    requireRule(title.length > 0 && title.length <= 100 && description.length > 0 && description.length <= 2000, 'CHALLENGE_INVALID', 400);
    requireRule(Number.isSafeInteger(command.rewardPoints) && command.rewardPoints >= 0 && command.rewardPoints <= 10000, 'CHALLENGE_INVALID', 400);
    // 特殊人物由工作人员线下扮演。系统只负责把挑战发给被抓到的队伍并留痕，
    // 是否完成、加减多少分由工作人员现场判定，用 correct_score 手动入账。
    const challenge = { id: randomUUID(), teamId, title, description, rewardPoints: command.rewardPoints, status: 'ISSUED', issuedBy: actor.id, issuedAt: state.now };
    (state.challenges ??= []).push(challenge);
    message(state, teamId, 'challenge', `特殊挑战：${title}｜${description}`, true, challenge.id);
    result = { challenge };
  } else if (command.type === 'location') {
    requireRule(actor.role === 'player' && actor.leader, 'LEADER_ONLY', 403); requireRunning(state);
    const team = teamFor(state, actor); requireRule(!team.finishedAt, 'TEAM_FINISHED'); requireRule(command.foreground === true, 'PAGE_NOT_FOREGROUND');
    const { latitude, longitude, accuracy, capturedAt } = command;
    requireRule(Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180 && Number.isFinite(accuracy) && accuracy >= 0 && Number.isFinite(capturedAt), 'LOCATION_INVALID', 400);
    const previous = state.locations[team.id]; requireRule(!previous || state.now - previous.receivedAt >= state.config.locationIntervalMs, 'LOCATION_THROTTLED', 429);
    const position = { latitude, longitude, accuracy, capturedAt, receivedAt: state.now, leaderId: actor.id, restored: false };
    state.locations[team.id] = position;
    abilityLocation(state, team.id, position, { message });
    const lastSample = state.locationHistory.findLast(item => item.teamId === team.id);
    if (!lastSample || state.now - lastSample.receivedAt >= state.config.sampleMs) state.locationHistory.push({ ...position, teamId: team.id });
    result = { position, sampled: !lastSample || state.now - lastSample.receivedAt >= state.config.sampleMs };
  } else if (command.type === 'ack_effect') {
    const effect = state.effects.find(item => item.id === command.effectId && item.teamId === actor.teamId); requireRule(effect, 'FORBIDDEN', 403);
    if (effect.startedAt == null) effect.startedAt = elapsed(state); result = { effect };
  } else if (command.type === 'read_message') {
    const item = visibleMessages(state, actor).find(message => message.id === command.messageId); requireRule(item, 'FORBIDDEN', 403);
    const original = state.messages.find(message => message.id === item.id); if (!original.readBy.includes(actor.id)) original.readBy.push(actor.id);
    const deviceId = command.deviceId; requireRule(typeof deviceId === 'string' && deviceId.length > 0 && deviceId.length < 100, 'DEVICE_INVALID', 400);
    if (command.played && !original.playedBy.includes(deviceId)) original.playedBy.push(deviceId); result = { read: true, played: original.playedBy.includes(deviceId) };
  } else if (command.type === 'task_nickname') {
    requireRule(actor.role === 'player', 'FORBIDDEN', 403); requireRunning(state);
    requireRule(!teamFor(state, actor).finishedAt && state.config.tasks.some(task => task.id === 'PHI24'), 'TASK_INVALID', 400);
    requireRule(taskIsRevealed(state, teamFor(state, actor), state.config.tasks.find(task => task.id === 'PHI24')), 'PHOTO_FIND_REQUIRED');
    const account = state.accounts.find(item => item.id === actor.id);
    requireRule(account, 'FORBIDDEN', 403);
    account.nickname = '零零五'; result = { nickname: account.nickname };
  } else if (command.type === 'task_failure') {
    manage(actor); requireRule(['RUNNING', 'PAUSED'].includes(state.status), 'GAME_NOT_REVIEWABLE');
    const team = state.teams.find(item => item.id === command.teamId), task = state.config.tasks.find(item => item.id === command.taskId);
    requireRule(team && !team.finishedAt && team.regionId && task?.failurePenalty && typeof command.attemptId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(command.attemptId) && Number.isSafeInteger(command.count) && command.count > 0 && command.count <= 100 && command.reason?.trim(), 'TASK_ATTEMPTS_INVALID', 400);
    state.taskFailures ??= {};
    const record = { teamId: team.id, taskId: task.id, count: command.count, points: -task.failurePenalty * command.count, reason: command.reason };
    const previous = state.taskFailures[command.attemptId];
    requireRule(!previous || JSON.stringify(previous) === JSON.stringify(record), 'IDEMPOTENCY_CONFLICT');
    if (!previous) { state.taskFailures[command.attemptId] = record; credit(state, team.id, record.points, 'TASK_PENALTY', `attempt:${command.attemptId}`, actor, command.reason); }
    result = { ...record, score: score(state, team.id) };
  } else if (command.type === 'finish_team') {
    manage(actor); requireRunning(state);
    const ids = command.teamIds ?? [command.teamId];
    requireRule(Array.isArray(ids) && ids.length > 0 && new Set(ids).size === ids.length && ids.every(id => state.teams.some(team => team.id === id)), 'TEAM_NOT_FOUND', 404);
    const teams = ids.map(id => state.teams.find(team => team.id === id));
    requireRule(teams.every(team => !team.finishedAt), 'TEAM_FINISHED');
    requireRule(!state.abilityUses.some(use => (use.targets.some(id => ids.includes(id)) || ids.includes(use.casterTeamId)) && (['PENDING', 'AWAITING_ACK', 'AWAITING_REVIEW'].includes(use.status) || use.status === 'ACTIVE' && ![3, 8].includes(use.number))), 'ABILITY_FINISH_BLOCKED');
    if (state.config.finishRewards) {
      requireRule(command.reason?.trim(), 'REASON_REQUIRED', 400);
      requireRule(teams.every(team => team.regionId === state.config.regions.at(-1)), 'FINISH_REGION_REQUIRED');
      requireRule(!state.submissions.some(item => ids.includes(item.teamId) && item.status === 'QUEUED'), 'FINISH_TASKS_PENDING');
    }
    const award = finishAward(state, teams.length);
    for (const team of teams) { team.finishedAt = state.now; team.finishRank = award.firstRank; team.finishPoints = award.points; credit(state, team.id, award.points, 'FINISH', team.id, actor, command.reason ?? '工作人员现场确认'); }
    result = { team: teams[0], teams, finishRank: award.firstRank, points: award.points, allFinished: state.teams.every(item => item.finishedAt != null) };
  } else if (command.type === 'correct_score') {
    manage(actor); requireRule(command.reason?.trim() && Number.isSafeInteger(command.points) && Math.abs(command.points) <= 10000 && state.teams.some(team => team.id === command.teamId), 'CORRECTION_INVALID', 400);
    credit(state, command.teamId, command.points, 'CORRECTION', randomUUID(), actor, command.reason); result = { score: score(state, command.teamId) };
  } else if (command.type === 'configure') {
    manage(actor); requireRule(command.reason?.trim(), 'REASON_REQUIRED', 400);
    requireRule(!state.config.finishRewards || command.patch?.finishPoints == null, 'CONFIG_INVALID', 400);
    requireRule(command.patch && Object.keys(command.patch).every(name => ['taskLimit', 'storageWarnBytes', 'finishPoints'].includes(name)) && Object.values(command.patch).every(value => Number.isSafeInteger(value) && value > 0), 'CONFIG_INVALID', 400);
    state.configHistory.push(structuredClone(state.config)); state.config = { ...state.config, ...command.patch, version: state.config.version + 1 }; result = { version: state.config.version };
  } else throw new RuleError('COMMAND_UNKNOWN', '未实现的测试命令', 400);
  state.audit.push({ id: ++state.sequence, actor: actor.id, type: command.type, reason: command.reason ?? '', at: state.now, before, after: { status: state.status, configVersion: state.config.version, ledgerCount: state.ledger.length, submissionCount: state.submissions.length } });
  state.idempotency[keyId] = { fingerprint, result: structuredClone(result) };
  return result;
}

export function advanceClock(state, milliseconds) {
  requireRule(Number.isSafeInteger(milliseconds) && milliseconds >= 0 && milliseconds <= 86400000, 'CLOCK_INVALID', 400);
  state.virtualTime += milliseconds; tick(state); return { serverTime: state.now, elapsedMs: elapsed(state) };
}

export function exportBackup(state) {
  const content = JSON.stringify(state); return { schemaVersion: 1, content, sha256: hash(content) };
}
export function restoreBackup(input) {
  requireRule(typeof input?.content === 'string' && input.sha256 === hash(input.content), 'BACKUP_INVALID', 400);
  let state; try { state = JSON.parse(input.content); } catch { throw new RuleError('BACKUP_INVALID', '备份格式无效', 400); }
  requireRule(state.schemaVersion === 1 && Array.isArray(state.accounts) && state.config?.version > 0, 'BACKUP_VERSION_INVALID', 400);
  for (const media of Object.values(state.media)) requireRule(media.sha256 === hash(Buffer.from(media.base64, 'base64')), 'BACKUP_MEDIA_INVALID', 400);
  for (const position of Object.values(state.locations)) position.restored = true;
  return state;
}
