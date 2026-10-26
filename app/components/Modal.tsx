'use client';

import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

type Size = 'sm' | 'md' | 'lg';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: Size;
  children: ReactNode;
  /** Hide the X close button (e.g. for force-action confirms) */
  hideClose?: boolean;
  /** Prevent backdrop click from closing (e.g. mid-action) */
  disableBackdropClose?: boolean;
}

const SIZE_MAX_WIDTH: Record<Size, string> = {
  sm: '420px',
  md: '560px',
  lg: '720px',
};

// Selector for focusable elements inside the modal — used by the focus trap
// to find what to cycle through on Tab.
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  children,
  hideClose = false,
  disableBackdropClose = false,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Keep the latest onClose in a ref so it doesn't drive the focus
  // effect's deps. Parents that re-render on every keystroke (e.g. the
  // shorten-URL form) pass a fresh onClose each render — if we depend
  // on it, the effect re-fires and re-focuses the first focusable
  // element, stealing focus from the input the user is typing in.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => setMounted(true), []);

  // Esc to dismiss + body scroll lock + focus management.
  // Only `open` is a real dep — when the dialog transitions open we set
  // up the focus + listener; on close we tear them down.
  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the first focusable element inside the dialog (or the dialog
    // itself) once it mounts.
    requestAnimationFrame(() => {
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusables && focusables.length > 0) {
        focusables[0].focus();
      } else {
        dialogRef.current?.focus();
      }
    });

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        // Focus trap: cycle Tab inside the dialog
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
        );
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = originalOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  const handleBackdropClick = useCallback(() => {
    if (disableBackdropClose) return;
    onClose();
  }, [disableBackdropClose, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-2 sm:items-center sm:p-4">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="app-modal-backdrop absolute inset-0 cursor-default border-none bg-[rgba(20,32,24,0.32)] backdrop-blur-[8px]"
        onClick={handleBackdropClick}
      />

      {/* Dialog — bottom sheet on phones, centred card from sm up. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="app-modal-dialog theme-light relative flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-[1.4rem] border border-line bg-paper outline-none sm:max-h-[calc(100dvh-2rem)]"
        style={{
          maxWidth: SIZE_MAX_WIDTH[size],
          boxShadow: '0 28px 80px rgba(20,32,24,0.2)',
        }}
      >
        {(title || !hideClose) && (
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-5 sm:px-6">
            <div className="min-w-0 flex-1">
              {title && (
                <h2
                  id={titleId}
                  className="text-[1.45rem] font-bold leading-[1.05] tracking-[-0.045em] text-ink"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p id={descriptionId} className="mt-1.5 text-sm leading-relaxed text-[#5f6962]">
                  {description}
                </p>
              )}
            </div>
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="-mr-1 -mt-1 inline-flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[#5f6962] transition-colors hover:bg-paper-deep hover:text-ink"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        )}

        <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

// ── ConfirmDialog ─────────────────────────────────────────────────────────
// Thin wrapper for the common "are you sure" pattern. Built on Modal so it
// inherits the focus trap, Esc dismiss, and styling.
interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" turns the confirm button red — use for destructive actions */
  variant?: 'default' | 'danger';
  loading?: boolean;
  error?: string;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  loading = false,
  error,
}: ConfirmDialogProps) {
  const danger = variant === 'danger';
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      disableBackdropClose={loading}
    >
      {error && (
        <div role="alert" className="notice notice--danger mb-4">
          <p className="notice__body">{error}</p>
        </div>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} disabled={loading} className="btn-secondary">
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          aria-busy={loading}
          className={`btn-primary ${danger ? '!border-[#b42318] !bg-[#b42318] hover:!bg-[#912018]' : ''}`}
        >
          {loading && <span className="spinner" aria-hidden="true" />}
          {loading ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
