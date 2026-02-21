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

interface AuthConfig {
  authorizationTimeoutSeconds: number;
  features: Record<string, boolean>;
  providers: Record<string, boolean>;
}

export default function AuthorizePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authRequest, setAuthRequest] = useState<AuthorizationRequest | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientFavicon, setClientFavicon] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(600); // Default, will be updated from API
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [authorizationTimeoutSeconds, setAuthorizationTimeoutSeconds] = useState<number>(600);

  useEffect(() => {
    const loadAuthorizationRequest = async () => {
      const state = searchParams.get('state');
      const clientId = searchParams.get('client_id');
      const redirectUri = searchParams.get('redirect_uri');
      const scopes = searchParams.get('scope')?.split(' ') || [];

      if (!state || !clientId || !redirectUri) {
        setError('Invalid authorization request');
        return;
      }

      try {
        // Fetch authorization configuration (includes timeout settings)
        const configResponse = await fetch('/api/auth/config');
        if (!configResponse.ok) {
          throw new Error('Failed to load configuration');
        }
        const config: AuthConfig = await configResponse.json();
        setAuthorizationTimeoutSeconds(config.authorizationTimeoutSeconds);
        setTimeRemaining(config.authorizationTimeoutSeconds);

        // Fetch client details from registered OAuth clients
        const clientResponse = await fetch(
          `/api/auth/oauth-clients/${clientId}?validate_redirect_uri=${encodeURIComponent(redirectUri)}`
        );

        if (!clientResponse.ok) {
          const errorData = await clientResponse.json();
          setError(errorData.error || 'Application not found or invalid redirect URI');
          return;
        }

        const clientData = await clientResponse.json();

        // Extract domain from redirect URI for favicon
        const redirectUrl = new URL(redirectUri);
        const domain = redirectUrl.hostname;

        setAuthRequest({
          clientId,
          clientName: clientData.name || domain,
          clientUrl: `https://${domain}`,
          redirectUri,
          scopes: scopes.length > 0 ? scopes : clientData.scopes || [],
          state,
        });

        // Load client favicon
        setClientFavicon(`https://${domain}/favicon.ico`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load authorization request');
      }
    };

    loadAuthorizationRequest();
  }, [searchParams]);

  // Timer countdown effect - uses timeout from config
  useEffect(() => {
    if (!authRequest || hasTimedOut) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setHasTimedOut(true);
          setError('Authorization request expired. Please start again.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [authRequest, hasTimedOut]);

  const handleAuthorize = async () => {
    if (!authRequest || hasTimedOut) return;

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
    if (!authRequest || hasTimedOut) return;
    // Redirect back with error
    const errorRedirect = new URL(authRequest.redirectUri);
    errorRedirect.searchParams.append('error', 'access_denied');
    errorRedirect.searchParams.append('state', authRequest.state);
    window.location.href = errorRedirect.toString();
  };

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-2" style={{ background: 'linear-gradient(135deg, #0c0f0a 0%, #0f1410 50%, #0c0f0a 100%)' }}>
        <div className="rounded-lg shadow-lg p-8 max-w-md w-full text-center" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <h1 className="text-2xl font-bold mb-4" style={{ color: '#ff6b6b' }}>Authorization Error</h1>
          <p className="mb-6" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>{error}</p>
          <button
            onClick={() => router.push('/login')}
            className="font-semibold py-2 px-4 rounded-lg transition"
            style={{ background: 'rgba(255, 107, 107, 0.15)', color: '#ff6b6b', border: '1px solid rgba(255, 107, 107, 0.3)' }}
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  if (!authRequest) {
    return (
      <div className="flex items-center justify-center min-h-screen p-2" style={{ background: 'linear-gradient(135deg, #0c0f0a 0%, #0f1410 50%, #0c0f0a 100%)' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 mx-auto mb-4" style={{ borderBottom: '2px solid #a3e635' }}></div>
          <p style={{ color: '#a3e635' }}>Loading authorization request...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-2" style={{ background: 'linear-gradient(135deg, #0c0f0a 0%, #0f1410 50%, #0c0f0a 100%)' }}>
      <div className="w-full max-w-md">
        <div className="rounded-2xl shadow-2xl overflow-hidden backdrop-blur-lg" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <div className="px-6 py-8 text-center" style={{ background: 'linear-gradient(135deg, rgba(163, 230, 53, 0.1) 0%, rgba(163, 230, 53, 0.05) 100%)', borderBottom: '1px solid rgba(163, 230, 53, 0.2)' }}>
            <h1 className="text-2xl font-bold mb-2" style={{ color: '#a3e635' }}>Authorization Request</h1>
            <p style={{ color: 'rgba(163, 230, 53, 0.7)' }}>Secure application access</p>
          </div>

          <div className="p-8">
            <div className="flex items-center justify-center mb-8">
              <div className="text-center">
                <div className="flex flex-col items-center mb-4">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg mb-3" style={{ background: 'linear-gradient(135deg, rgba(163, 230, 53, 0.2) 0%, rgba(163, 230, 53, 0.1) 100%)', border: '2px solid rgba(163, 230, 53, 0.3)' }}>
                    <svg
                      className="w-8 h-8"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      style={{ color: '#a3e635' }}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold mb-0.5" style={{ color: '#f5f5f4' }}>Elixpo Accounts</p>
                  <p className="text-xs" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Your Identity Provider</p>
                </div>

                {/* Handshake Arrow */}
                <div className="flex items-center justify-center mb-4">
                  <div className="flex gap-2">
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#a3e635' }}></div>
                    <div className="w-8 h-0.5" style={{ background: 'linear-gradient(90deg, #a3e635 0%, rgba(163, 230, 53, 0.4) 100%)' }}></div>
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#a3e635' }}></div>
                  </div>
                </div>

                {/* Client Application (Right) */}
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg mb-3 overflow-hidden" style={{ background: 'rgba(255, 255, 255, 0.05)', border: '2px solid rgba(163, 230, 53, 0.2)' }}>
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
                      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(163, 230, 53, 0.2) 0%, rgba(163, 230, 53, 0.1) 100%)' }}>
                        <span className="text-sm font-bold" style={{ color: '#a3e635' }}>
                          {authRequest.clientName.charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-sm font-semibold mb-0.5" style={{ color: '#f5f5f4' }}>{authRequest.clientName}</p>
                  <p className="text-xs" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Requesting Access</p>
                </div>
              </div>
            </div>

            {/* Authorization Details */}
            <div className="rounded-lg p-4 mb-6" style={{ background: 'rgba(163, 230, 53, 0.05)', border: '1px solid rgba(163, 230, 53, 0.1)' }}>
              <h2 className="text-sm font-semibold mb-3" style={{ color: '#f5f5f4' }}>
                {authRequest.clientName} is requesting access to:
              </h2>
              <ul className="space-y-2">
                {authRequest.scopes.length > 0 ? (
                  authRequest.scopes.map((scope) => (
                    <li key={scope} className="flex items-start gap-2">
                      <svg
                        className="w-4 h-4 mt-0.5 shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        style={{ color: '#a3e635' }}
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
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
                      className="w-4 h-4 mt-0.5 shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      style={{ color: '#a3e635' }}
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Basic authentication</span>
                  </li>
                )}
              </ul>
            </div>

            {/* Information Text */}
            <div className="rounded-lg p-4 mb-6" style={{ background: 'rgba(163, 230, 53, 0.08)', border: '1px solid rgba(163, 230, 53, 0.15)' }}>
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                <span className="font-semibold" style={{ color: '#a3e635' }}>Secure Authorization:</span> You are
                being redirected to authorize your account. Only Elixpo-verified applications can
                request access. You can revoke access at any time in your account settings.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleDeny}
                disabled={isLoading || hasTimedOut}
                className="flex-1 font-semibold py-3 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'rgba(163, 230, 53, 0.1)', color: '#a3e635', border: '1px solid rgba(163, 230, 53, 0.3)' }}
              >
                Deny
              </button>
              <button
                onClick={handleAuthorize}
                disabled={isLoading || hasTimedOut}
                className="flex-1 font-semibold py-3 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ background: 'rgba(163, 230, 53, 0.15)', color: '#a3e635', border: '1px solid rgba(163, 230, 53, 0.3)' }}
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

            {/* Timer Display */}
            <div className="mt-4 text-center">
              <div
                className="inline-block px-3 py-2 rounded-lg text-sm font-semibold"
                style={{
                  background: timeRemaining < 60 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(163, 230, 53, 0.1)',
                  color: timeRemaining < 60 ? '#ef4444' : '#a3e635',
                  border: `1px solid ${timeRemaining < 60 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(163, 230, 53, 0.3)'}`,
                }}
              >
                <span>⏱️ Request expires in: {formatTime(timeRemaining)}</span>
              </div>
              {timeRemaining < 60 && (
                <p className="text-xs mt-2" style={{ color: '#ef4444' }}>
                  ⚠️ Authorization request expiring soon
                </p>
              )}
            </div>

            {/* Footer */}
            <p className="text-xs text-center mt-4" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
              Don't recognize this app?{' '}
              <button
                onClick={() => router.push('/login')}
                className="font-semibold hover:opacity-80"
                style={{ color: '#a3e635' }}
              >
                Go back to safety
              </button>
            </p>
          </div>
        </div>

        {/* Security Notice */}
        <div className="mt-6 text-center text-sm" style={{ color: 'rgba(255, 255, 255, 0.4)' }}>
          <p>🔒 This connection is encrypted and secure</p>
        </div>
      </div>
    </div>
  );
}
