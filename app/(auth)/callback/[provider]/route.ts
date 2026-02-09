import { NextRequest, NextResponse } from 'next/server';

/**
 * Callback route for OAuth providers
 * Delegates to /api/auth/callback/[provider] API route
 * This maintains backward compatibility with the old URL structure
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  const { provider } = params;
  
  // Construct the API route URL with all query parameters
  const apiUrl = new URL(`/api/auth/callback/${provider}`, request.url);
  apiUrl.search = request.nextUrl.search;

  // Call the API route and return its response
  const apiRoute = await import(`/app/api/auth/callback/[provider]/route`);
  return apiRoute.GET(request, { params: { provider } });
}
