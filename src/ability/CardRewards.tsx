import { useEffect, useRef, useState } from 'react';
import { GameClient } from './client';
import { useOverlayBusy } from '../components/overlay';
import { CardReceipt } from '../cards/CardReceipt';
import { abilityCardModel } from '../cards/TacticCard';
import { nextCardReward } from '../cards/rewardQueue';

type Entry = Record<string, any>;
type Props = { view: Entry; accountId?: string; staff: boolean; client: GameClient; refresh: () => Promise<void>; preview?: Entry | null; closePreview: () => void };

export default function CardRewards({ view, accountId, staff, client, refresh, preview, closePreview }: Props) {
  const [card, setCard] = useState<Entry | null>(null);
  const completed = useRef(new Set<string>());
  const overlayBusy = useOverlayBusy();
  useEffect(() => {
    if (card) {
      if (!view.abilityCatalog.some((definition: Entry) => definition.number === card.number)) setCard(null);
      return;
    }
    if (overlayBusy || document.querySelector('dialog[open], [aria-modal="true"]')) return;
    const next = preview && !completed.current.has(preview.id) ? preview : !staff && accountId ? nextCardReward(view.abilityCards, view.abilityCatalog, accountId, completed.current) : null;
    if (next && view.abilityCatalog.some((definition: Entry) => definition.number === next.number)) setCard(next);
  }, [card, overlayBusy, preview, staff, accountId, view.abilityCards, view.abilityCatalog]);
  if (!card) return null;
  const definition = view.abilityCatalog.find((item: Entry) => item.number === card.number);
  if (!definition) return null;
  return <CardReceipt key={card.id} card={abilityCardModel({ id: card.id, number: card.number }, definition)} preview={card.source === 'preview'} sourceLabel={card.source === 'preview' ? '动效预览' : card.wave ? `第 ${card.wave} 轮 · 半小时补给` : card.source === 'tasks' ? '任务奖励' : '新补给'} onConfirm={async () => {
    if (card.source !== 'preview') await client.command({ type: 'ability_reveal', instanceId: card.id });
  }} onDone={() => {
    // “稍后查看”只关闭本次展示；服务器标记不变，下次登录仍可收到。
    completed.current.add(card.id);
    if (card.source === 'preview') closePreview(); else void refresh().catch(() => {});
    setCard(null);
  }} />;
}
