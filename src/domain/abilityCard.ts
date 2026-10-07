import type { GameCard } from '../types';

export function abilityCategory(number: number, target: string): GameCard['category'] {
  return number === 3 ? 'intel' : ['self', 'highest'].includes(target) ? 'boost' : 'control';
}

export function automaticCardTarget(target?: string) {
  return target === 'self' ? '本队' : target === 'all' ? '全体未完赛队伍' : target === 'others' ? '除本队外的未完赛队伍' : target === 'random' ? '由服务器随机指定队伍' : null;
}
