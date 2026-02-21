/**
 * Captcha (Turnstile) verification utility
 */

export async function verifyTurnstile(token: string): Promise<boolean> {
  try {
    const secretKey = process.env.TURNSTILE_SECRET_KEY;

    if (!secretKey) {
      console.warn('[Captcha] TURNSTILE_SECRET_KEY not configured, skipping verification');
      return process.env.NODE_ENV === 'development';
    }

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        secret: secretKey,
        response: token,
      }),
    });

    if (!response.ok) {
      console.error('[Captcha] Verification request failed:', response.status);
      return false;
    }

    const data = await response.json() as { success: boolean; error_codes?: string[] };

    if (!data.success) {
      console.error('[Captcha] Verification failed:', data.error_codes);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Captcha] Verification error:', error);
    return false;
  }
}
