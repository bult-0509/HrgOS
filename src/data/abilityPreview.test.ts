import { describe, expect, it } from 'vitest';
import catalog from './abilityCatalog.json';
import { previewAbilityCards } from './abilityPreview';
import { initialCards } from './mock';
import { automaticCardTarget } from '../domain/abilityCard';
import { gameCardModel } from '../cards/TacticCard';

describe('真实功能卡的本地展示', () => {
  it('每张卡都有原编号与独立中文卡名，原规则和正式目录完全一致', () => {
    expect(previewAbilityCards).toHaveLength(catalog.length);
    expect(new Set(previewAbilityCards.map(card => card.number)).size).toBe(catalog.length);
    expect(new Set(previewAbilityCards.map(card => card.name)).size).toBe(catalog.length);
    for (const definition of catalog) {
      const card = previewAbilityCards.find(card => card.number === definition.number)!;
      expect(card.name).toBe(definition.title);
      expect(card.description).toBe(definition.description);
      expect(card.target).toBe(definition.target);
      expect(card.needsConfirmation).toBe(![3,8].includes(definition.number));
    }
  });
  it('前三张展示真实卡组中的合照、冻结和十分钟排名透视，不再使用旧占位卡', () => {
    expect(initialCards.map(card => card.name)).toEqual(['合照换分', '原地冻结', '排名透视']);
    expect(initialCards[2].description).toBe('立即查看全体队伍积分和排名，持续 10 分钟。');
    expect(gameCardModel(initialCards[2]).badge).toBe('03');
    expect(gameCardModel(initialCards[2]).badgeLabel).toBe('能力卡编号 3');
    expect(initialCards).toHaveLength(3);
  });
  it('自动目标不能伪装成任选对手，手动目标继续由服务器校验', () => {
    expect(automaticCardTarget('self')).toBe('本队');
    expect(automaticCardTarget('all')).toBe('全体未完赛队伍');
    expect(automaticCardTarget('others')).toBe('除本队外的未完赛队伍');
    expect(automaticCardTarget('random')).toBe('由服务器随机指定队伍');
    expect(automaticCardTarget('other')).toBeNull();
    expect(automaticCardTarget('highest')).toBeNull();
  });
});
