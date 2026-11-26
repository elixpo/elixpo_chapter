export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { pricingForCountry } from '../../../lib/pricing';
import { PAID_PLANS_ENABLED } from '../../../lib/paidPlans';

// Returns PPP-adjusted prices for the visitor's country (Cloudflare geo header).
export async function GET(request) {
  if (!PAID_PLANS_ENABLED) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  let cc = request.headers.get('cf-ipcountry') || '';
  if (!cc) { try { cc = request.cf?.country || ''; } catch {} }
  return NextResponse.json(pricingForCountry(cc), {
    headers: { 'cache-control': 'public, max-age=300' },
  });
}
