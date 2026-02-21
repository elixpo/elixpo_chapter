'use client';

import { Box, Button, Typography } from '@mui/material';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

const ErrorPage = () => {
  const searchParams = useSearchParams();
  const error = searchParams.get('error') || 'Authentication Error';
  const description = searchParams.get('description') || 'An error occurred during authentication. Please try again.';

  const errorMessages: { [key: string]: string } = {
    'access_denied': 'Access was denied. Please check your credentials and try again.',
    'invalid_request': 'Invalid request. Please contact support if the problem persists.',
    'server_error': 'Server error occurred. Please try again later.',
    'unauthorized': 'You are not authorized to access this resource.',
  };

  const displayMessage = errorMessages[error] || description;

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0c0f0a 0%, #0f1410 50%, #0c0f0a 100%)', p: 2 }}>
      <Box sx={{ maxWidth: '420px', width: '100%', backdropFilter: 'blur(20px)', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', p: 4, textAlign: 'center' }}>
        <Box sx={{ mb: 3, fontSize: '3rem' }}>⚠️</Box>
        
        <Typography variant="h4" sx={{ fontWeight: 700, color: '#f87171', mb: 2 }}>
          {error}
        </Typography>

        <Typography sx={{ color: 'rgba(255, 255, 255, 0.7)', mb: 4, lineHeight: 1.6 }}>
          {displayMessage}
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Link href="/login" style={{ textDecoration: 'none' }}>
            <Button fullWidth variant="contained" sx={{ background: 'rgba(163, 230, 53, 0.15)', color: '#a3e635', border: '1px solid rgba(163, 230, 53, 0.3)', fontWeight: 600, py: 1.5, textTransform: 'none', fontSize: '1rem', '&:hover': { background: 'rgba(163, 230, 53, 0.25)', borderColor: 'rgba(163, 230, 53, 0.5)' } }}>
              Back to Login
            </Button>
          </Link>

          <Link href="/" style={{ textDecoration: 'none' }}>
            <Button fullWidth variant="outlined" sx={{ color: 'rgba(255, 255, 255, 0.7)', border: '1px solid rgba(255, 255, 255, 0.2)', fontWeight: 600, py: 1.5, textTransform: 'none', fontSize: '1rem', '&:hover': { borderColor: 'rgba(255, 255, 255, 0.4)', color: '#f5f5f4' } }}>
              Go Home
            </Button>
          </Link>
        </Box>

        <Typography sx={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.85rem', mt: 4 }}>
          If you continue to experience issues, please contact support.
        </Typography>
      </Box>
    </Box>
  );
};

export default ErrorPage;
