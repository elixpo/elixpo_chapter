'use client';

import { useEffect, useRef, useState } from 'react';

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers/contexts without the async clipboard API.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    document.body.removeChild(area);
    return ok;
  }
}

const CopyIcon = (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);
const CheckIcon = (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/**
 * Copies `text` to the clipboard. `variant="code"` sits in a dark code-block
 * header; `variant="tool"` is the light pill used in the docs chrome.
 */
export default function CopyButton({
  text,
  label = 'Copy',
  copiedLabel = 'Copied',
  srLabel,
  variant = 'code',
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  /** Accessible name when the visible label is ambiguous (e.g. "Copy cURL"). */
  srLabel?: string;
  variant?: 'code' | 'tool';
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    const ok = await writeClipboard(text);
    if (!ok) return;
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={srLabel}
        data-copied={copied}
        className={variant === 'code' ? 'doc-copy' : 'doc-tool'}
      >
        {copied ? CheckIcon : CopyIcon}
        <span aria-hidden={srLabel ? true : undefined}>{copied ? copiedLabel : label}</span>
      </button>
      <span className="doc-sr-status" role="status" aria-live="polite">
        {copied ? copiedLabel : ''}
      </span>
    </>
  );
}
