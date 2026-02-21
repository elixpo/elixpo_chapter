/**
 * Prometheus Metrics Endpoint
 * Exposes metrics for Prometheus scraping
 * 
 * Add to wrangler.toml or your router:
 * GET /metrics - Prometheus metrics in text format
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMetricsText } from '../../../src/lib/prometheus-metrics';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const metrics = await getMetricsText();

    return new NextResponse(metrics, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Error generating metrics:', error);
    return NextResponse.json(
      { error: 'Failed to generate metrics' },
      { status: 500 }
    );
  }
}

/**
 * Health check endpoint for monitoring
 */
export async function HEAD() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
