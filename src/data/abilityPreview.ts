import catalog from './abilityCatalog.json';
import type { GameCard } from '../types';
import { abilityCategory } from '../domain/abilityCard';

/** 只读卡面目录，不是给本队发放全部卡；正式库存仍由服务器随机发放。 */
export const previewAbilityCards: GameCard[] = catalog.map(definition => ({
  id: `catalog-${definition.number}`,
  number: definition.number,
  name: definition.title,
  description: definition.description,
  target: definition.target as GameCard['target'],
  category: abilityCategory(definition.number, definition.target),
  uses: 1,
  needsConfirmation: ![3, 8].includes(definition.number),
}));
