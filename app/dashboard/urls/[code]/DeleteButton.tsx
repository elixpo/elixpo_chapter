'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/app/components/Modal';

export default function DeleteButton({ code }: { code: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/urls/${code}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/dashboard/urls');
        return;
      }
      setError('Could not delete this link. Please try again.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-danger min-h-[44px] px-5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 6h18M19 6l-1.4 14a2 2 0 01-2 2H8.4a2 2 0 01-2-2L5 6" />
        </svg>
        Delete
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => !loading && setOpen(false)}
        onConfirm={handleDelete}
        title={`Delete /${code}?`}
        description="This URL will be deleted permanently. The short link stops redirecting and its analytics are lost."
        confirmLabel="Delete link"
        variant="danger"
        loading={loading}
        error={error}
      />
    </>
  );
}
