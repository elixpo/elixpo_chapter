import { permanentRedirect } from 'next/navigation';

export const runtime = 'edge';

/**
 * /cli is a memorable entry point for the developer CLI. The canonical,
 * indexable page (with SoftwareApplication JSON-LD) lives at /docs/cli.
 */
export default function CliPage() {
  permanentRedirect('/docs/cli');
}
