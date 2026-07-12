"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

// Accessible dialog that replaces window.prompt across the app: labelled,
// Esc-to-close, backdrop-to-close, focus moved in on open.
export const Modal = ({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Esc-to-close: subscribe once per open. Reads onClose via a ref so a new
  // inline onClose each render does not re-run this effect.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Move focus in only when the dialog opens — never on subsequent renders,
  // or it would steal focus mid-typing.
  useEffect(() => {
    if (open) {
      panelRef.current?.querySelector<HTMLElement>("input, select, button")?.focus();
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal__backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={panelRef}
      >
        <div className="modal__header">
          <h2 className="modal__title">{title}</h2>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>
  );
};
