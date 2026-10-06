import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { GameClient } from './client';
import './cardRewards.css';

type Entry = Record<string, any>;
type Props = { view: Entry; accountId?: string; staff: boolean; client: GameClient; refresh: () => Promise<void>; preview?: Entry | null; closePreview: () => void };

export default function CardRewards({ view, accountId, staff, client, refresh, preview, closePreview }: Props) {
  const [card, setCard] = useState<Entry | null>(null);
  const [phase, setPhase] = useState('enter'); const [error, setError] = useState('');
  const completed = useRef(new Set<string>()); const dialog = useRef<HTMLDialogElement>(null); const flight = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null); const receiving = useRef(false);
  useEffect(() => {
    if (card) return;
    const next = preview && !completed.current.has(preview.id) ? preview : (!staff && accountId ? view.abilityCards.find((item: Entry) => item.status === 'AVAILABLE' && Array.isArray(item.revealedBy) && !item.revealedBy.includes(accountId) && !completed.current.has(item.id)) : null);
    if (next) { setError(''); setPhase(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'ready' : 'enter'); setCard(next); }
  }, [card, preview, staff, accountId, view.abilityCards]);
  useEffect(() => {
    if (!card) return;
    previousFocus.current = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const element = dialog.current; if (element && !element.open) element.showModal();
    const timer = window.setTimeout(() => setPhase('ready'), 1050);
    return () => { clearTimeout(timer); element?.close(); document.body.style.overflow = previousOverflow; previousFocus.current?.focus(); };
  }, [card]);
  useEffect(() => { if (phase === 'ready') dialog.current?.querySelector('button')?.focus(); }, [phase]);
  const receive = async () => {
    if (!card || phase !== 'ready' || receiving.current) return;
    receiving.current = true; setError('');
    try {
      if (card.source !== 'preview') await client.command({ type: 'ability_reveal', instanceId: card.id });
      setPhase('flight');
      const element = flight.current; const target = document.querySelector('[data-ability-deck]');
      if (element && target && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const from = element.getBoundingClientRect(), to = target.getBoundingClientRect();
        const x = to.x + to.width / 2 - from.x - from.width / 2, y = to.y + to.height / 2 - from.y - from.height / 2;
        await element.animate([
          { transform: 'translate3d(0,0,0) rotate(0deg) scale(1)', opacity: 1 },
          { offset: .4, transform: `translate3d(${x * .32}px,${y * .62}px,0) rotate(12deg) scale(.7)`, opacity: 1 },
          { transform: `translate3d(${x}px,${y}px,0) rotate(24deg) scale(.06)`, opacity: 0 },
        ], { duration: 580, easing: 'cubic-bezier(.45,0,.82,.35)', fill: 'forwards' }).finished;
      }
      completed.current.add(card.id);
      if (card.source === 'preview') closePreview(); else void refresh().catch(() => {});
      setCard(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '暂时无法确认展示，请重试。卡牌已经保存。'); setPhase('ready'); }
    finally { receiving.current = false; }
  };
  if (!card) return null;
  const definition = view.abilityCatalog.find((item: Entry) => item.number === card.number);
  if (!definition) return null;
  return <dialog ref={dialog} className="reward-dialog" data-phase={phase} aria-labelledby="reward-heading" onCancel={event => { event.preventDefault(); void receive(); }}>
    <div className="reward-vignette" aria-hidden="true" />
    <div className="ability-deck-anchor reward-deck-target" aria-hidden="true"><span /><span>牌库 {view.abilityCards.filter((item: Entry) => item.status === 'AVAILABLE').length}</span></div>
    <header className="reward-heading"><p>{card.source === 'preview' ? '动效预览' : card.wave ? `第 ${card.wave} 轮 · 半小时补给` : '获得新卡牌'}</p><h2 id="reward-heading">获得能力卡</h2><span>{card.source === 'preview' ? '预览不会发放或消耗卡牌' : '已加入本队共享牌库'}</span></header>
    <div className="reward-stage">
      <div className="reward-aura" aria-hidden="true" />
      <div className="reward-sparks" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ '--angle': `${i * 22.5}deg`, '--delay': `${i % 4 * 40}ms` } as CSSProperties} />)}</div>
      <div ref={flight} className="reward-flight"><div className="reward-arrival"><div className="reward-rotor">
        <div className="reward-back" aria-hidden="true"><div className="reward-back-rune">HRG</div><span>失序重奏</span></div>
        <article className="reward-front">
          <span className="reward-orb" aria-label={`第${card.number}张`}>{card.number}</span><h3>{definition.title}</h3>
          <div className="reward-portrait" aria-hidden="true"><svg viewBox="0 0 240 150"><defs><radialGradient id="reward-sigil-glow"><stop stopColor="#e6e59a" /><stop offset="1" stopColor="#277275" stopOpacity="0" /></radialGradient></defs><circle cx="120" cy="65" r="65" fill="url(#reward-sigil-glow)" /><circle cx="120" cy="65" r="45" fill="none" stroke="#d7bd70" strokeWidth="1.5" /><path d="M69 130L98 75L107 99L123 28L139 82L151 65L176 130Z" fill="#152b30" stroke="#e8cb83" strokeWidth="2" /><path d="M123 28L125 127M69 130L109 112L176 130M103 90L116 72M137 88L145 112" fill="none" stroke="#e8cb83" strokeWidth="2" /><path d="M119 15L123 5L127 15L123 24Z" fill="#f9dc87" /><path d="M41 65L50 68L41 71L38 68ZM200 52L208 56L200 60L197 56Z" fill="#f9dc87" /></svg></div>
          <span className="reward-card-type">能力 · {definition.target === 'self' ? '自身队伍' : definition.target === 'all' ? '全体队伍' : '战术挑战'}</span>
          <div className="reward-rules"><p>{definition.description}</p></div><footer>HRG · 失序重奏</footer>
        </article>
      </div></div></div>
    </div>
    <div className="reward-controls">{error ? <p role="alert">{error}</p> : null}<button className="reward-claim" disabled={phase !== 'ready'} onClick={() => void receive()}>{phase === 'flight' ? '收入牌库…' : '收下'}</button><p>卡牌由服务器随机发放 · 同队成员共享</p></div>
  </dialog>;
}
