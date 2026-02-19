'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';

interface AuthorizationRequest {
  clientId: string;
  clientName: string;
  clientUrl: string;
  redirectUri: string;
  scopes: string[];
  state: string;
}

export default function AuthorizePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authRequest, setAuthRequest] = useState<AuthorizationRequest | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientFavicon, setClientFavicon] = useState<string | null>(null);

  // Hardcoded trusted domains for now
  const TRUSTED_DOMAINS = ['elixpo.com', 'www.elixpo.com'];

  useEffect(() => {
    const state = searchParams.get('state');
    const clientId = searchParams.get('client_id');
    const redirectUri = searchParams.get('redirect_uri');
    const scopes = searchParams.get('scope')?.split(' ') || [];

    if (!state || !clientId || !redirectUri) {
      setError('Invalid authorization request');
      return;
    }

    // Validate redirect URI domain is trusted
    try {
      const redirectUrl = new URL(redirectUri);
      const domain = redirectUrl.hostname;

      if (!TRUSTED_DOMAINS.includes(domain)) {
        setError(`Unauthorized domain: ${domain}`);
        return;
      }

      // Extract client name from domain
      const clientName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
      const clientUrl = `https://${domain}`;

      setAuthRequest({
        clientId,
        clientName,
        clientUrl,
        redirectUri,
        scopes,
        state,
      });

      // Load client favicon
      setClientFavicon(`https://${domain}/favicon.ico`);
    } catch (err) {
      setError('Invalid redirect URI');
    }
  }, [searchParams]);

  const handleAuthorize = async () => {
    if (!authRequest) return;

    setIsLoading(true);
    try {
      // Call the authorize endpoint with user consent
      const response = await fetch('/api/auth/authorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          state: authRequest.state,
          clientId: authRequest.clientId,
          redirectUri: authRequest.redirectUri,
          scopes: authRequest.scopes,
          approved: true,
        }),
      });

      if (!response.ok) {
        throw new Error('Authorization failed');
      }

      const data = await response.json();
      // Redirect to client with authorization code
      window.location.href = data.redirectUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authorization failed');
      setIsLoading(false);
    }
  };

  const handleDeny = () => {
    if (!authRequest) return;
    // Redirect back with error
    const errorRedirect = new URL(authRequest.redirectUri);
    errorRedirect.searchParams.append('error', 'access_denied');
    errorRedirect.searchParams.append('state', authRequest.state);
    window.location.href = errorRedirect.toString();
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-linear-to-br from-red-50 to-red-100">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Authorization Error</h1>
          <p className="text-gray-700 mb-6">{error}</p>
          <button
            onClick={() => router.push('/login')}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  if (!authRequest) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading authorization request...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="w-full max-w-md">
        {/* Handshake Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-linear-to-r from-blue-600 to-indigo-600 px-6 py-8 text-center">
            <h1 className="text-2xl font-bold text-white mb-2">Authorization Request</h1>
            <p className="text-blue-100">Secure application access</p>
          </div>

          {/* Content */}
          <div className="p-8">
            {/* Handshake Visualization */}
            <div className="flex items-center justify-center mb-8">
              <div className="text-center">
                {/* Your Application (Left) */}
                <div className="flex flex-col items-center mb-4">
                  <div className="w-16 h-16 rounded-full bg-linear-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-lg mb-3">
                    <svg
                      className="w-8 h-8 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-800">Elixpo Accounts</p>
                  <p className="text-xs text-gray-500">Your Identity Provider</p>
                </div>

                {/* Handshake Arrow */}
                <div className="flex items-center justify-center mb-4">
                  <div className="flex gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    <div className="w-8 h-0.5 bg-linear-to-r from-green-500 to-green-400"></div>
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  </div>
                </div>

                {/* Client Application (Right) */}
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center shadow-lg mb-3 overflow-hidden">
                    {clientFavicon ? (
                      <Image
                        src={clientFavicon}
                        alt={authRequest.clientName}
                        width={40}
                        height={40}
                        onError={() => {
                          // Fallback icon
                          setClientFavicon(null);
                        }}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-linear-to-br from-purple-400 to-purple-600 flex items-center justify-center">
                        <span className="text-white text-sm font-bold">
                          {authRequest.clientName.charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-gray-800">{authRequest.clientName}</p>
                  <p className="text-xs text-gray-500">Requesting Access</p>
                </div>
              </div>
            </div>

            {/* Authorization Details */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h2 className="text-sm font-semibold text-gray-800 mb-3">
                {authRequest.clientName} is requesting access to:
              </h2>
              <ul className="space-y-2">
                {authRequest.scopes.length > 0 ? (
                  authRequest.scopes.map((scope) => (
                    <li key={scope} className="flex items-start gap-2">
                      <svg
                        className="w-4 h-4 text-green-600 mt-0.5 shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="text-sm text-gray-700">
                        {scope === 'profile' && 'Your profile information'}
                        {scope === 'email' && 'Your email address'}
                        {scope === 'openid' && 'OpenID authentication'}
                        {!['profile', 'email', 'openid'].includes(scope) && scope}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="flex items-start gap-2">
                    <svg
                      className="w-4 h-4 text-green-600 mt-0.5 shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-sm text-gray-700">Basic authentication</span>
                  </li>
                )}
              </ul>
            </div>

            {/* Information Text */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-xs text-gray-700 leading-relaxed">
                <span className="font-semibold text-blue-900">Secure Authorization:</span> You are
                being redirected to authorize your account. Only Elixpo-verified applications can
                request access. You can revoke access at any time in your account settings.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleDeny}
                disabled={isLoading}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Deny
              </button>
              <button
                onClick={handleAuthorize}
                disabled={isLoading}
                className="flex-1 bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Authorizing...
                  </>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Authorize
                  </>
                )}
              </button>
            </div>

            {/* Footer */}
            <p className="text-xs text-gray-500 text-center mt-4">
              Don't recognize this app?{' '}
              <button
                onClick={() => router.push('/login')}
                className="text-blue-600 hover:text-blue-700 font-semibold"
              >
                Go back to safety
              </button>
            </p>
          </div>
        </div>

        {/* Security Notice */}
        <div className="mt-6 text-center text-sm text-gray-400">
          <p>🔒 This connection is encrypted and secure</p>
        </div>
      </div>
    </div>
  );
}
