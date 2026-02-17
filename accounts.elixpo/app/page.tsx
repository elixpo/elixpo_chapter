'use client';

import { useEffect } from 'react';
import { redirect } from 'next/navigation';
import { Box, CircularProgress } from '@mui/material';

export default function Home() {
  useEffect(() => {
    redirect('/login');
  }, []);

  return (


    
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
      }}
    >
      <CircularProgress sx={{ color: '#22c55e' }} size={60} />
    </Box>
  );
}
