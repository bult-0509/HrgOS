import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Layers3 } from 'lucide-react';
import { lockOverlayScroll, restoreOverlayFocus } from '../components/overlay';
import { TacticCard, type TacticCardModel } from './TacticCard';

type Props = { card: TacticCardModel; sourceLabel: string; preview?: boolean; onConfirm: () => Promise<unknown>; onDone: (confirmed: boolean) => void };
type Phase = 'enter' | 'ready' | 'saving' | 'flight';

export function CardReceipt({ card, sourceLabel, preview = false, onConfirm, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'ready' : 'enter');
  const [error, setError] = useState('');
  const [dockStyle, setDockStyle] = useState<CSSProperties>({});
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const flight = useRef<HTMLDivElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const animation = useRef<Animation | null>(null);
  const pending = useRef(false);
  const generation = useRef(0);
  const callbacks = useRef({ onConfirm, onDone });
  callbacks.current = { onConfirm, onDone };

  useEffect(() => {
    ++generation.current;
    const element = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockOverlayScroll();
    element?.showModal();
    confirmButton.current?.focus({ preventScroll: true });
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const reduce = () => {
      if (!media.matches) return;
      setPhase(current => current === 'enter' ? 'ready' : current);
      animation.current?.cancel();
    };
    const positionDock = () => {
      const target = document.querySelector<HTMLElement>('[data-card-deck], [data-ability-deck]');
      if (target) {
        const rect = target.getBoundingClientRect();
        setDockStyle({ left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: 'auto', bottom: 'auto' });
      }
    };
    positionDock();
    window.addEventListener('resize', positionDock);
    media.addEventListener('change', reduce);
    const timer = window.setTimeout(() => setPhase(current => current === 'enter' ? 'ready' : current), 680);
    return () => {
      ++generation.current;
      window.clearTimeout(timer);
      window.removeEventListener('resize', positionDock);
      media.removeEventListener('change', reduce);
      animation.current?.cancel();
      element?.close();
      unlock();
      restoreOverlayFocus(previousFocus);
    };
  }, []);

  const receive = async () => {
    if (pending.current) return;
    pending.current = true;
    const session = generation.current;
    setError('');
    setPhase('saving');
    try {
      // 服务器展示确认与视觉动画分开：取消飞行不能回滚一张已确认的卡。
      await callbacks.current.onConfirm();
    } catch (cause) {
      if (session !== generation.current) return;
      pending.current = false;
      setError(cause instanceof Error ? cause.message : '确认失败，卡牌仍在牌库。请重试。');
      setPhase('ready');
      return;
    }
    if (session !== generation.current) return;
    setPhase('flight');
    const element = flight.current;
    const target = dialog.current?.querySelector('.hrg-receipt__dock');
    if (element && target && typeof element.animate === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const from = element.getBoundingClientRect(), to = target.getBoundingClientRect();
      const x = to.left + to.width / 2 - from.left - from.width / 2;
      const y = to.top + to.height / 2 - from.top - from.height / 2;
      const scale = Math.min(.22, to.height / from.height);
      const motion = element.animate([
        { transform: 'translate3d(0,0,0) rotate(0deg) scale(1)', opacity: 1 },
        { offset: .23, transform: `translate3d(${x * .08}px,${Math.min(-28, y * .08)}px,0) rotate(-5deg) scale(1.03)`, opacity: 1 },
        { offset: .8, transform: `translate3d(${x * .83}px,${y * .78}px,0) rotate(10deg) scale(.28)`, opacity: .95 },
        { transform: `translate3d(${x}px,${y}px,0) rotate(0deg) scale(${scale})`, opacity: 0 },
      ], { duration: 560, easing: 'cubic-bezier(.45,0,.75,.45)', fill: 'forwards' });
      animation.current = motion;
      let timer = 0;
      await Promise.race([motion.finished.catch(() => {}), new Promise<void>(resolve => { timer = window.setTimeout(resolve, 720); })]);
      window.clearTimeout(timer);
      motion.cancel();
      animation.current = null;
    }
    if (session === generation.current) callbacks.current.onDone(true);
  };

  return createPortal(<dialog ref={dialog} className="hrg-receipt" data-phase={phase} aria-labelledby={`${id}-heading`} aria-describedby={`${id}-note`} aria-busy={phase === 'saving'} onCancel={event => {
    event.preventDefault();
    if (phase === 'enter') setPhase('ready');
    else if (phase === 'ready') callbacks.current.onDone(false);
  }}>
    <div className="hrg-receipt__layout">
      <header className="hrg-receipt__heading"><p>{sourceLabel}</p><h2 id={`${id}-heading`}>{preview ? '收卡预览' : '获得能力卡'}</h2><span id={`${id}-note`}>{preview ? '仅预览，不发放或消耗卡牌' : '已加入本队共享牌库'}</span></header>
      <div className="hrg-receipt__stage">
        <span className="hrg-receipt__halo" aria-hidden="true" />
        <div ref={flight} className="hrg-receipt__flight"><div className="hrg-receipt__arrival"><div className="hrg-receipt__turn">
          <div className="hrg-receipt__back" aria-hidden="true"><Layers3 size={60} strokeWidth={1} /><span>HRG</span></div>
          <div className="hrg-receipt__front"><TacticCard card={card} /></div>
        </div></div></div>
      </div>
      <div className="hrg-receipt__controls">
        {error ? <p role="alert">{error}</p> : null}
        <button ref={confirmButton} className="hrg-receipt__claim" disabled={phase === 'saving' || phase === 'flight'} onClick={() => void receive()}>{phase === 'saving' ? '确认中…' : phase === 'flight' ? '收入牌库…' : '收入牌库'}</button>
        <button className="hrg-receipt__later" disabled={phase === 'saving' || phase === 'flight'} onClick={() => callbacks.current.onDone(false)}>稍后查看</button>
        <p>{preview ? '预览完后返回当前页面' : '收下只确认展示，不会使用这张卡'}</p>
      </div>
    </div>
    <span className="hrg-deck-dock hrg-receipt__dock" style={dockStyle} aria-hidden="true"><Layers3 size={22} /><span>牌库</span></span>
  </dialog>, document.body);
}

/** 出牌和奖励不共用 transform；效果已提交，动画只是视觉反馈。 */
export function CardCast({ card, onDone }: { card: TacticCardModel; onDone: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const callback = useRef(onDone);
  callback.current = onDone;
  useEffect(() => {
    const element = dialog.current;
    const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockOverlayScroll();
    element?.showModal();
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const timer = window.setTimeout(() => callback.current(), media.matches ? 80 : 720);
    const reduce = () => { if (media.matches) callback.current(); };
    media.addEventListener('change', reduce);
    return () => { window.clearTimeout(timer); media.removeEventListener('change', reduce); element?.close(); unlock(); restoreOverlayFocus(focus); };
  }, []);
  return createPortal(<dialog ref={dialog} className="hrg-card-cast" aria-label={`已打出 ${card.title}`} onCancel={event => { event.preventDefault(); callback.current(); }}><div><TacticCard card={card} /><span role="status">已打出</span></div></dialog>, document.body);
}
