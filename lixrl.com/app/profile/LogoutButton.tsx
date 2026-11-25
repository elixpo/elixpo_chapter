'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LogoutButton() {
  const router = useRouter();

  const [pending, setPending] = useState(false);

  const handleLogout = async () => {
    setPending(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <button type="button" onClick={handleLogout} disabled={pending} aria-busy={pending} className="btn-secondary">
      {pending && <span className="spinner" aria-hidden="true" />}
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
