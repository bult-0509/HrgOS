import { describe, expect, it } from 'vitest';
import { initialAuditQueue, teams } from '../data/mock';
import { reviewAudit, type ReviewCommand, type ReviewState } from './regionProgress';

function seed(): ReviewState {
  return {
    teams, auditQueue: [initialAuditQueue[1]], regionAuditLog: [],
    regionProgress: Object.fromEntries(teams.map(t => [t.id, {currentRegionId: 'stage-a', version: 1}]))
  };
}
const approve: ReviewCommand = {itemId:'A-109', result:'approve', actor:'staff', operatorId:'staff-demo', reviewedAt:'2026-10-06T10:00:00Z'};

describe('工作人员审核驱动的按队区域推进', () => {
  it('通过本队普通任务才占用本区计分名额，同一共享任务不会重复占用或转给后来队伍', () => {
    const state = seed();
    state.auditQueue = [{ ...initialAuditQueue[0], id: 'quota-1', teamId: 'team-1', taskId: 'PHI01', taskRegionId: 'stage-a' }];
    const first = reviewAudit(state, { ...approve, itemId: 'quota-1' });
    expect(first.taskCompletions).toEqual([{ teamId: 'team-1', regionId: 'stage-a', taskId: 'PHI01' }]);
    const second = reviewAudit({ ...first, auditQueue: [{ ...state.auditQueue[0], id: 'quota-2', teamId: 'team-2' }] }, { ...approve, itemId: 'quota-2' });
    expect(second.taskCompletions).toHaveLength(1);
  });
  it('队伍入口审核通过只推进该队，不修改其他队状态、分数或格子任务', () => {
    const state=seed(), next=reviewAudit(state,approve);
    expect(next.regionProgress['team-5']).toEqual({currentRegionId:'stage-b',version:2});
    expect(next.regionProgress['team-1']).toBe(state.regionProgress['team-1']);
    expect(next.teams.find(t=>t.id==='team-5')?.score).toBe(74);
    expect(next.regionAuditLog[0]).toMatchObject({from:'stage-a',to:'stage-b',operatorId:'staff-demo'});
    expect(next.auditQueue).toHaveLength(0);
  });
  it('打回、等待审核与普通任务通过均不换区', () => {
    const state=seed();
    expect(state.regionProgress['team-5'].currentRegionId).toBe('stage-a');
    const rejected=reviewAudit(state,{...approve,result:'reject'});
    expect(rejected.regionProgress).toBe(state.regionProgress);
    expect(rejected.regionAuditLog[0].result).toBe('reject');
    const ordinary={...state,auditQueue:[initialAuditQueue[0]]};
    expect(reviewAudit(ordinary,{...approve,itemId:'A-108'}).regionProgress).toBe(ordinary.regionProgress);
  });
  it('玩家请求、跳区、回退、目标缺失、已完赛及越过队首均不生效', () => {
    const state=seed();
    expect(reviewAudit(state,{...approve,actor:'player'})).toBe(state);
    for(const targetRegionId of ['stage-c','stage-a',undefined]) {
      const invalid={...state,auditQueue:[{...state.auditQueue[0],targetRegionId}]};
      expect(reviewAudit(invalid,approve)).toBe(invalid);
    }
    const finished={...state,teams:state.teams.map(t=>t.id==='team-5'?{...t,status:'finished' as const}:t)};
    expect(reviewAudit(finished,approve)).toBe(finished);
    expect(reviewAudit(state,{...approve,itemId:'not-the-head'})).toBe(state);
  });
  it('重复审核不会二次推进或新增留痕', () => {
    const state=reviewAudit(seed(),approve);
    expect(reviewAudit(state,approve)).toBe(state);
    expect(state.regionAuditLog).toHaveLength(1);
  });
});
