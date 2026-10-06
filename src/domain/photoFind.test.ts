import { describe, expect, it } from 'vitest';
import { canRevealTask } from './photoFind';
import { reviewAudit, type ReviewState } from './regionProgress';
import { teams } from '../data/mock';

describe('图寻复刻照审核与任务解锁', () => {
  it('区域通过不等于图寻完成，提交或打回不揭示任务，六个直接格无需图寻', () => {
    expect(canRevealTask('P01', 'stage-b')).toBe(false);
    expect(canRevealTask('P01', 'stage-b', { P01: { status: 'pending' } })).toBe(false);
    expect(canRevealTask('P01', 'stage-b', { P01: { status: 'rejected' } })).toBe(false);
    expect(canRevealTask('P01', 'stage-b', { P01: { status: 'approved' } })).toBe(true);
    expect(canRevealTask('P02', 'stage-b', { P01: { status: 'approved' } })).toBe(false);
    expect(canRevealTask('D01', null)).toBe(true);
  });
  it('工作人员审核格位图寻只解锁本队该区域，不换区、不影响其他队', () => {
    const state: ReviewState = { teams, regionAuditLog: [], regionProgress: { 'team-1': { currentRegionId: 'stage-b', version: 2 } }, auditQueue: [{ id: 'photo-1', kind: '格位图寻', teamId: 'team-1', team: 'Phigros队', photoRegionId: 'stage-b', photoSlot: 'P01', task: '图寻 #1', submittedAt: '12:00:00', waitingSeconds: 0, imageTone: 'tone-cyan', checklist: [] }] };
    const command = { itemId: 'photo-1', actor: 'staff' as const, operatorId: 'staff-1', result: 'approve' as const, reviewedAt: '2026-10-07' };
    const next = reviewAudit(state, command);
    expect(next.photoFinds?.['team-1']['stage-b'].P01?.status).toBe('approved');
    expect(next.photoFinds?.['team-2']).toBeUndefined();
    expect(next.regionProgress).toBe(state.regionProgress);
    expect(next.teams).toBe(state.teams);
    expect(reviewAudit(state, { ...command, actor: 'player' })).toBe(state);
    expect(reviewAudit(state, { ...command, result: 'reject' }).photoFinds?.['team-1']['stage-b'].P01?.status).toBe('rejected');
  });
});
