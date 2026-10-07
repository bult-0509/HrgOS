import { Crosshair, Layers3, Radar, Zap } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { GameCard } from '../types';
import { abilityCategory } from '../domain/abilityCard';
import './cards.css';

export type CardCategory = 'intel' | 'boost' | 'control';
export type TacticCardModel = { id: string; title: string; description: string; category: CardCategory; badge: string | number; badgeLabel: string };
export const cardCategoryLabels = { intel: '情报', boost: '增益', control: '干扰' };

export function gameCardModel(card: GameCard): TacticCardModel {
  return { id: card.id, title: card.name, description: card.description, category: card.category, badge: card.number == null ? card.uses : String(card.number).padStart(2, '0'), badgeLabel: card.number == null ? `剩余 ${card.uses} 次` : `能力卡编号 ${card.number}` };
}

export function abilityCardModel(instance: { id: string; number: number }, definition: { title: string; description: string; target: string }): TacticCardModel {
  const category = abilityCategory(instance.number, definition.target);
  return { id: instance.id, title: definition.title, description: definition.description, category, badge: String(instance.number).padStart(2, '0'), badgeLabel: `能力卡编号 ${instance.number}` };
}

/** 唯一的卡面；手牌只收窄摘要，详情和奖励保留完整规则。 */
export function TacticCard({ card, compact = false }: { card: TacticCardModel; compact?: boolean }) {
  const Icon = card.category === 'intel' ? Radar : card.category === 'boost' ? Zap : Crosshair;
  return <span className={`hrg-tactic-card hrg-tactic-card--${card.category}${compact ? ' hrg-tactic-card--compact' : ''}`} data-card-face={card.id}>
    <span className="hrg-tactic-card__badge" aria-label={card.badgeLabel}>{card.badge}</span>
    <span className="hrg-tactic-card__title">{card.title}</span>
    <span className="hrg-tactic-card__art" aria-hidden="true"><i className="hrg-tactic-card__orbit" /><i className="hrg-tactic-card__orbit hrg-tactic-card__orbit--inner" /><Icon strokeWidth={1.3} /><span>{card.category === 'intel' ? 'SCAN' : card.category === 'boost' ? 'BOOST' : 'JAM'}</span></span>
    <span className="hrg-tactic-card__type">{cardCategoryLabels[card.category]}</span>
    <span className="hrg-tactic-card__rules" tabIndex={compact ? undefined : 0} aria-label={compact ? undefined : '卡牌完整规则'}>{card.description}</span>
    <span className="hrg-tactic-card__footer">{compact ? '点击查看' : 'HRG · 能力卡'}</span>
  </span>;
}

export function CardHand({ cards, onSelect }: { cards: TacticCardModel[]; onSelect: (id: string) => void }) {
  return <div className="hrg-card-hand" aria-label="当前持有的道具卡">
    {cards.map((card, index) => <button className="hrg-hand-card" key={card.id} style={{ '--card-angle': `${Math.max(-12, Math.min(12, (index - (cards.length - 1) / 2) * 5))}deg`, '--card-order': index, '--deal-delay': `${Math.min(index, 4) * 55}ms` } as CSSProperties} onClick={() => onSelect(card.id)} aria-label={`${card.title}，${card.badgeLabel}，点击查看完整规则`}>
      <span className="hrg-hand-card__arrival"><TacticCard card={card} compact /></span>
    </button>)}
  </div>;
}

export function CardDeckDock({ count, onClick }: { count: number; onClick: () => void }) {
  return <button className="hrg-deck-dock" data-card-deck data-ability-deck onClick={onClick} aria-label={`查看牌库，${count} 张可用`}><Layers3 size={22} aria-hidden="true" /><span>牌库 <span className="hrg-deck-dock__count">{count}</span></span></button>;
}
