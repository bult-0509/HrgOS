import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardHand, TacticCard, abilityCardModel, gameCardModel } from './TacticCard';
import { nextCardReward } from './rewardQueue';

describe('卡牌统一展示', () => {
  it('手牌与详情使用同一张卡面，详情保留全部规则与真实编号', () => {
    const card = abilityCardModel({ id: 'reward-22', number: 22 }, { title: '密钥竞速', description: '依次提交答案；审核通过后按服务器提交时间排序。', target: 'all' });
    const hand = renderToStaticMarkup(<CardHand cards={[card]} onSelect={() => {}} />);
    const detail = renderToStaticMarkup(<TacticCard card={card} />);
    expect(hand).toContain('data-card-face="reward-22"');
    expect(detail).toContain('data-card-face="reward-22"');
    expect(detail).toContain('依次提交答案；审核通过后按服务器提交时间排序。');
    expect(detail).toContain('aria-label="能力卡编号 22"');
    expect(hand).not.toContain('spire-card');
  });
  it('情报、增益与干扰分类明确，展示次数不会伪装成费用', () => {
    expect(abilityCardModel({ id: '3', number: 3 }, { title: '排名透视', description: '', target: 'all' }).category).toBe('intel');
    expect(abilityCardModel({ id: '8', number: 8 }, { title: '双手', description: '', target: 'self' }).category).toBe('boost');
    expect(abilityCardModel({ id: '22', number: 22 }, { title: '竞速', description: '', target: 'all' }).category).toBe('control');
    const card = gameCardModel({ id: 'scan', name: '透视', description: '完整说明', category: 'intel', uses: 2 });
    expect(renderToStaticMarkup(<TacticCard card={card} />)).toContain('aria-label="剩余 2 次"');
  });
});

describe('真实奖励队列', () => {
  const catalog = [{ number: 3 }, { number: 8 }];
  const cards = [
    { id: 'missing', number: 99, status: 'AVAILABLE', revealedBy: [] },
    { id: 'old', number: 3, status: 'AVAILABLE' },
    { id: 'used', number: 3, status: 'USED', revealedBy: [] },
    { id: 'shown', number: 3, status: 'AVAILABLE', revealedBy: ['me'] },
    { id: 'first', number: 3, status: 'AVAILABLE', revealedBy: ['peer'] },
    { id: 'second', number: 8, status: 'AVAILABLE', revealedBy: [] },
  ];
  it('缺失定义和历史数据不阻塞队列，同队另一个成员仍可看一次', () => {
    expect(nextCardReward(cards, catalog, 'me', new Set())?.id).toBe('first');
    expect(nextCardReward(cards, catalog, 'me', new Set(['first']))?.id).toBe('second');
    expect(nextCardReward(cards, catalog, 'me', new Set(['first', 'second']))).toBeUndefined();
    expect(cards[4].revealedBy).toEqual(['peer']);
  });
});
