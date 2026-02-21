/**
 * OAuth Provider Configuration
 * Get secrets from Cloudflare Secrets Manager in production
 */

import type { D1Database } from '@cloudflare/workers-types';

export interface OAuthProvider {
  name: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  scopes: string[];
}

export interface OAuthClient {
  clientId: string;
  name: string;
  redirectUris: string[];
  scopes: string[];
  createdAt: string;
  isActive: boolean;
}

export function getOAuthConfig(
  provider: string,
  env: {
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GITHUB_CLIENT_ID?: string;
    GITHUB_CLIENT_SECRET?: string;
  }
): OAuthProvider | null {
  switch (provider.toLowerCase()) {
    case 'google':
      return {
        name: 'google',
        clientId: env.GOOGLE_CLIENT_ID || '',
        clientSecret: env.GOOGLE_CLIENT_SECRET || '',
        redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`,
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
        userInfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
        scopes: ['openid', 'profile', 'email'],
      };

    case 'github':
      return {
        name: 'github',
        clientId: env.GITHUB_CLIENT_ID || '',
        clientSecret: env.GITHUB_CLIENT_SECRET || '',
        redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/github`,
        authorizationEndpoint: 'https://github.com/login/oauth/authorize',
        tokenEndpoint: 'https://github.com/login/oauth/access_token',
        userInfoEndpoint: 'https://api.github.com/user',
        scopes: ['read:user', 'user:email'],
      };

    default:
      return null;
  }
}

/**
 * Get OAuth client from database (for dynamically registered applications)
 * 
 * This allows third-party applications to register their own OAuth credentials
 * instead of using environment variables.
 */
export async function getOAuthClientFromDB(
  db: D1Database,
  clientId: string
): Promise<OAuthClient | null> {
  try {
    const stmt = db.prepare(
      'SELECT client_id, name, redirect_uris, scopes, created_at, is_active FROM oauth_clients WHERE client_id = ? AND is_active = 1'
    );
    const result = await stmt.bind(clientId).first() as any;

    if (!result) {
      return null;
    }

    return {
      clientId: result.client_id,
      name: result.name,
      redirectUris: JSON.parse(result.redirect_uris || '[]'),
      scopes: JSON.parse(result.scopes || '[]'),
      createdAt: result.created_at,
      isActive: result.is_active === 1,
    };
  } catch (error) {
    console.error('[OAuth] Error fetching client from DB:', error);
    return null;
  }
}

/**
 * Validate OAuth client credentials
 * 
 * Checks that clientId is registered and clientSecretHash matches
 */
export async function validateOAuthClientCredentials(
  db: D1Database,
  clientId: string,
  clientSecretHash: string
): Promise<boolean> {
  try {
    const stmt = db.prepare(
      'SELECT 1 FROM oauth_clients WHERE client_id = ? AND client_secret_hash = ? AND is_active = 1'
    );
    const result = await stmt.bind(clientId, clientSecretHash).first();
    return !!result;
  } catch (error) {
    console.error('[OAuth] Error validating client credentials:', error);
    return false;
  }
}
