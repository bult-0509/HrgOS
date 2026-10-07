import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from 'react-dom';
import { lockOverlayScroll, restoreOverlayFocus } from './overlay';
import './overlay.css';
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import type { ToastState } from "../types";

export function StatusChip({
  tone = "neutral",
  children
}: {
  tone?: "success" | "warning" | "danger" | "info" | "neutral" | "gold";
  children: ReactNode;
}) {
  return <span className={`status-chip status-chip--${tone}`}>{children}</span>;
}

export function SectionHeading({
  eyebrow,
  title,
  action
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Modal({
  title,
  description,
  children,
  closeDisabled = false,
  dismissible = true,
  onClose
}: {
  title: string;
  description?: string;
  children: ReactNode;
  closeDisabled?: boolean;
  dismissible?: boolean;
  onClose: () => void;
}) {
  const [isClosing, setIsClosing] = useState(false);
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeDisabledRef = useRef(closeDisabled);
  closeDisabledRef.current = closeDisabled || !dismissible;
  const isClosingRef = useRef(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  const requestClose = useCallback(() => {
    if (isClosingRef.current || closeDisabledRef.current) return;
    isClosingRef.current = true;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => onCloseRef.current(), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 150);
  }, []);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockOverlayScroll();
    const element = dialogRef.current;
    element?.showModal();
    const frame = window.requestAnimationFrame(() => (closeButtonRef.current ?? headingRef.current)?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      element?.close();
      unlock();
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      restoreOverlayFocus(previouslyFocused);
    };
  }, [requestClose]);

  return createPortal(
    <dialog ref={dialogRef} role="dialog" className={`modal-backdrop ${isClosing ? "is-closing" : ""}`} aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-description` : undefined} onCancel={event => { event.preventDefault(); requestClose(); }} onMouseDown={event => { if (event.target === event.currentTarget) requestClose(); }}>
      <section
        className={`modal-card ${isClosing ? "is-closing" : ""}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {dismissible ? <button ref={closeButtonRef} className="icon-button modal-close" disabled={closeDisabled} onClick={requestClose} aria-label="关闭弹窗">
          <X size={20} aria-hidden="true" />
        </button> : null}
        <p className="eyebrow">HRG GAME</p>
        <h2 ref={headingRef} tabIndex={-1} id={`${id}-title`}>{title}</h2>
        {description ? <p className="modal-description" id={`${id}-description`}>{description}</p> : null}
        <div className="modal-content">{children}</div>
      </section>
    </dialog>, document.body
  );
}

export function ToastStack({ toasts }: { toasts: ToastState[] }) {
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => {
        const Icon = toast.tone === "success" ? CheckCircle2 : toast.tone === "warning" ? TriangleAlert : Info;
        return (
          <div className={`toast toast--${toast.tone}`} key={toast.id}>
            <Icon size={20} aria-hidden="true" />
            <div>
              <strong>{toast.title}</strong>
              <p>{toast.body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon">{icon}</span>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}
