type Reward = { id: string; number: number; status: string; revealedBy?: string[] };

/** 按服务器库存顺序补看；旧数据、已用卡、缺少定义的卡不能阻塞后面的奖励。 */
export function nextCardReward<T extends Reward>(cards: T[], catalog: { number: number }[], accountId: string, shown: ReadonlySet<string>): T | undefined {
  return cards.find(card => card.status === 'AVAILABLE' && Array.isArray(card.revealedBy) && !card.revealedBy.includes(accountId) && !shown.has(card.id) && catalog.some(definition => definition.number === card.number));
}
