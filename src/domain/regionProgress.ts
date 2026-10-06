import { photoRegions } from '../data/photoClues';
import type { AuditItem, TeamStatus, UserMode } from '../types';
import type { PhotoFinds } from './photoFind';
import { isPhotoSlot } from './photoFind';

export type PhotoRegionId = (typeof photoRegions)[number]['id'];
export interface TeamRegionProgress {
  currentRegionId: PhotoRegionId | null;
  version: number;
}
export interface RegionAuditLog {
  auditId: string;
  teamId: string;
  from: PhotoRegionId | null;
  to: PhotoRegionId;
  result: 'approve' | 'reject';
  operatorId: string;
  reviewedAt: string;
}
export interface ReviewState {
  teams: TeamStatus[];
  auditQueue: AuditItem[];
  regionProgress: Record<string, TeamRegionProgress>;
  regionAuditLog: RegionAuditLog[];
  photoFinds?: PhotoFinds;
}
export interface ReviewCommand {
  itemId: string;
  result: 'approve' | 'reject';
  actor: UserMode;
  operatorId: string;
  reviewedAt: string;
}

/** 前端原型的审核 reducer；生产环境须在服务器鉴权、事务和广播中执行同样的约束。 */
export function reviewAudit(state: ReviewState, command: ReviewCommand): ReviewState {
  if (command.actor !== 'staff') return state;
  const item = state.auditQueue[0];
  // FIFO、重复处理以及不存在的提交不能改变状态。
  if (!item || item.id !== command.itemId) return state;
  if (item.kind === '格位图寻') {
    if (!item.teamId || !item.photoRegionId || !isPhotoSlot(item.photoSlot) || !photoRegions.some(r => r.id === item.photoRegionId) || !state.teams.some(t => t.id === item.teamId && t.status !== 'finished')) return state;
    const all = state.photoFinds ?? {}, team = all[item.teamId] ?? {}, region = team[item.photoRegionId] ?? {};
    return { ...state, auditQueue: state.auditQueue.slice(1), photoFinds: { ...all, [item.teamId]: { ...team, [item.photoRegionId]: { ...region, [item.photoSlot!]: { status: command.result === 'approve' ? 'approved' : 'rejected', submissionId: item.id, operatorId: command.operatorId, reviewedAt: command.reviewedAt } } } } };
  }
  if (item.kind !== '图寻题') return { ...state, auditQueue: state.auditQueue.slice(1) };

  const team = state.teams.find(t => t.id === item.teamId);
  const progress = item.teamId ? state.regionProgress[item.teamId] : undefined;
  const target = photoRegions.find(r => r.id === item.targetRegionId);
  if (!team || !progress || !target || team.status === 'finished') return state;
  const current = photoRegions.find(r => r.id === progress.currentRegionId);
  // 只推进至下一地区：不能跳区、倒退或重复发出进入事件。
  if (target.number !== (current?.number ?? 0) + 1) return state;
  const approved = command.result === 'approve';
  return {
    ...state,
    auditQueue: state.auditQueue.slice(1),
    teams: approved ? state.teams.map(t => t.id === team.id ? { ...t, region: target.name } : t) : state.teams,
    regionProgress: approved ? { ...state.regionProgress, [team.id]: { currentRegionId: target.id, version: progress.version + 1 } } : state.regionProgress,
    regionAuditLog: [...state.regionAuditLog, {
      auditId: item.id, teamId: team.id, from: progress.currentRegionId, to: target.id,
      result: command.result, operatorId: command.operatorId, reviewedAt: command.reviewedAt
    }]
  };
}
