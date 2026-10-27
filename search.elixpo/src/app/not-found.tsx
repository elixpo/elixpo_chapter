import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="site-shell flex items-center justify-center px-6 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-indigo-600/[0.05] rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 text-center max-w-md">
        <div className="text-8xl font-display font-bold text-[#e53935] mb-4">404</div>
        <h1 className="text-xl font-display font-semibold text-[#151515] mb-3">Page not found</h1>
        <p className="text-sm text-[#5f5c58] mb-8 leading-relaxed">
          The page you&#39;re looking for doesn&#39;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#151515] hover:bg-[#e53935] text-white text-sm font-medium transition-all hover:shadow-lg hover:shadow-indigo-600/25"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
