// Route-level loading placeholder for the logged-in app shell. Mirrors the
// page header + stat row + panel layout so content doesn't jump on load.
export default function PageSkeleton({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-live">{label}…</span>
      <div className="page-header" aria-hidden="true">
        <div>
          <span className="skeleton" style={{ width: 96, height: 10, marginBottom: 18 }} />
          <span className="skeleton" style={{ width: 'min(320px, 70%)', height: 40 }} />
          <span className="skeleton" style={{ width: 'min(420px, 90%)', height: 14, marginTop: 16 }} />
        </div>
        <span className="skeleton" style={{ width: 150, height: 44, borderRadius: 999 }} />
      </div>
      <div className="stat-grid" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="stat">
            <span className="skeleton" style={{ width: 70, height: 10 }} />
            <span className="skeleton" style={{ width: 90, height: 30, marginTop: 14 }} />
          </div>
        ))}
      </div>
      <div className="panel" style={{ marginTop: '1.5rem' }} aria-hidden="true">
        <span className="skeleton" style={{ width: 140, height: 16, marginBottom: 22 }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '12px 0' }}>
            <span className="skeleton" style={{ width: 80, height: 14 }} />
            <span className="skeleton" style={{ flex: 1, height: 12 }} />
            <span className="skeleton" style={{ width: 40, height: 14 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
