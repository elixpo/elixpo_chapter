'use client';

import { useState } from 'react';

export default function CopyEmailButton({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = email;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      } catch {
        window.location.href = `mailto:${email}`;
      }
      document.body.removeChild(ta);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border border-line bg-white px-4 font-mono text-[0.78rem] text-ink transition-colors hover:bg-paper-deep"
      aria-label={copied ? `${email} copied to clipboard` : `Copy ${email} to clipboard`}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
      {email}
      <span aria-live="polite" className="text-[0.68rem] font-sans font-bold text-green">
        {copied ? 'Copied' : ''}
      </span>
    </button>
  );
}
