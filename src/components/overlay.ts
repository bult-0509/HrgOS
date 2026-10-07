import { useEffect, useState } from 'react';

let scrollLocks = 0;
let previousOverflow = '';

/** 多个浮层共用滚动锁，关闭其中一个不会提前解锁另一个。 */
export function lockOverlayScroll() {
  if (scrollLocks++ === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--scrollLocks === 0) document.body.style.overflow = previousOverflow;
  };
}

export function restoreOverlayFocus(previous: HTMLElement | null) {
  // 下一个顶层弹窗已经打开时，不把焦点拉回背景。
  if (document.querySelector('dialog[open]')) return;
  const target = previous?.isConnected && previous !== document.body ? previous : document.querySelector<HTMLElement>('[data-card-deck]');
  target?.focus({ preventScroll: true });
}

/** 新奖励等正在操作的弹窗关闭后再展示，不打断上传或目标选择。 */
export function useOverlayBusy() {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const update = () => setBusy(!!document.querySelector('dialog[open], [aria-modal="true"]'));
    const observer = new MutationObserver(update);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open', 'aria-modal'] });
    update();
    return () => observer.disconnect();
  }, []);
  return busy;
}
