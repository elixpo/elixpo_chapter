/**
 * OAuth Provider Configuration
 * Get secrets from Cloudflare Secrets Manager in production
 */

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
