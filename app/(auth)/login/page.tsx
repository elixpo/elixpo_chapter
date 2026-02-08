'use client';

import { Box, Button, Checkbox, FormControlLabel, TextField, Typography, Divider } from '@mui/material';
import Link from 'next/link';
import { useState } from 'react';

const textFieldSx = {
  '& .MuiOutlinedInput-root': {
    color: '#f5f5f4',
    background: 'transparent',
    '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
    '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.2)' },
    '&.Mui-focused fieldset': { borderColor: '#a3e635' },
    '& input:-webkit-autofill': {
      WebkitBoxShadow: '0 0 0 1000px transparent inset !important',
      WebkitTextFillColor: '#f5f5f4 !important',
      WebkitTransition: 'background-color 5000s ease-in-out 0s',
    },
    '& input:-webkit-autofill:hover': {
      WebkitBoxShadow: '0 0 0 1000px transparent inset !important',
      WebkitTextFillColor: '#f5f5f4 !important',
    },
    '& input:-webkit-autofill:focus': {
      WebkitBoxShadow: '0 0 0 1000px transparent inset !important',
      WebkitTextFillColor: '#f5f5f4 !important',
    },
  },
  '& .MuiInputBase-input::placeholder': { color: 'transparent', opacity: 0 },
  '& .MuiInputLabel-root': { color: 'rgba(255, 255, 255, 0.7)' },
  '& .MuiInputLabel-root.Mui-focused': { color: '#a3e635' },
};

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Handle login logic here
    setTimeout(() => setLoading(false), 1000);
  };

  const handleSSOLogin = (provider: 'google' | 'github') => {
    const redirectUri = `${window.location.origin}/api/auth/callback/${provider}`;

    if (provider === 'google') {
      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=openid email profile`;
    } else if (provider === 'github') {
      window.location.href = `https://github.com/login/oauth/authorize?client_id=${process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID}&redirect_uri=${redirectUri}&scope=user:email`;
    }
  };

  return (

    <Box sx={{ minHeight: '90vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0c0f0a 0%, #0f1410 50%, #0c0f0a 100%)', p: 2 }}>
      <Box sx={{ maxWidth: '900px', width: '100%', display: 'flex', gap: 2.5, backdropFilter: 'blur(20px)', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', p: 3, flexDirection: { xs: 'column', md: 'row' } }}>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Box sx={{ mb: 2, textAlign: 'center' }}>
            <Typography variant="h4" sx={{ fontWeight: 700, color: '#f5f5f4', mb: 0.5 }}>Welcome Back</Typography>
            <Typography sx={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.95rem' }}>Sign in to your SSO account</Typography>
          </Box>

          <form onSubmit={handleSubmit}>
            <TextField fullWidth label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} margin="dense" sx={textFieldSx} required />
            <TextField fullWidth label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} margin="dense" sx={textFieldSx} required />

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1, mb: 2 }}>
              
              <FormControlLabel control={<Checkbox checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} sx={{ color: 'rgba(255, 255, 255, 0.5)', '&.Mui-checked': { color: '#a3e635' } }} />} label={<Typography sx={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.9rem' }}>Remember me</Typography>} />
              <Link href="/forgot-password" style={{ color: '#a3e635', textDecoration: 'none', fontSize: '0.9rem' }}>Forgot?</Link>
            </Box>

            <Button fullWidth variant="contained" type="submit" disabled={loading} sx={{ background: 'rgba(163, 230, 53, 0.15)', color: '#a3e635', border: '1px solid rgba(163, 230, 53, 0.3)', fontWeight: 600, py: 1.5, textTransform: 'none', fontSize: '1rem', '&:hover': { background: 'rgba(163, 230, 53, 0.25)', borderColor: 'rgba(163, 230, 53, 0.5)' }, '&:disabled': { color: 'rgba(255, 255, 255, 0.4)', borderColor: 'rgba(255, 255, 255, 0.1)' } }}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(255, 255, 255, 0.1)', textAlign: 'center' }}>
            <Typography sx={{ color: 'rgba(255, 255, 255, 0.7)', mb: 1 }}>Don't have an account?</Typography>
            <Link href="/register" style={{ color: '#a3e635', textDecoration: 'none', fontWeight: 600 }}>Create account</Link>
          </Box>
        </Box>

        
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: { xs: 0, md: 3 }, borderLeft: { xs: 'none', md: '1px solid rgba(255, 255, 255, 0.1)' }, paddingTop: { xs: 2, md: 0 }, borderTop: { xs: '1px solid rgba(255, 255, 255, 0.1)', md: 'none' } }}>
          <Box sx={{ mb: 2, textAlign: 'center' }}>
            <Typography sx={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.9rem' }}>Or continue with</Typography>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Button
              fullWidth
              variant="outlined"
              onClick={() => handleSSOLogin('google')}
              sx={{
                color: '#f5f5f4',
                borderColor: 'rgba(255, 255, 255, 0.2)',
                '&:hover': {
                  borderColor: 'rgba(255, 255, 255, 0.4)',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)'
                },
                py: 1,
                textTransform: 'none',
                fontSize: '0.95rem',
                fontWeight: 500
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Sign in with Google
              </Box>
            </Button>
            <Button
              fullWidth
              variant="outlined"
              onClick={() => handleSSOLogin('github')}
              sx={{
                color: '#f5f5f4',
                borderColor: 'rgba(255, 255, 255, 0.2)',
                '&:hover': {
                  borderColor: 'rgba(255, 255, 255, 0.4)',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)'
                },
                py: 1,
                textTransform: 'none',
                fontSize: '0.95rem',
                fontWeight: 500
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v 3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                Sign in with GitHub
              </Box>
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default LoginPage;
