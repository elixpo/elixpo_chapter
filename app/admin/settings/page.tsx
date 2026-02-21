'use client';

import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  Switch,
  FormControlLabel,
  Divider,
  Alert,
} from '@mui/material';
import { Save, CheckCircle } from '@mui/icons-material';

interface Settings {
  rateLimitMaxRequests: number;
  rateLimitWindowMs: number;
  jwtExpirationMinutes: number;
  refreshTokenExpirationDays: number;
  emailVerificationOtpLength: number;
  emailVerificationOtpExpiryMinutes: number;
  bcryptRounds: number;
  maintenanceMode: boolean;
  allowNewRegistrations: boolean;
  requireEmailVerification: boolean;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    rateLimitMaxRequests: 100,
    rateLimitWindowMs: 900000,
    jwtExpirationMinutes: 15,
    refreshTokenExpirationDays: 30,
    emailVerificationOtpLength: 6,
    emailVerificationOtpExpiryMinutes: 10,
    bcryptRounds: 10,
    maintenanceMode: false,
    allowNewRegistrations: true,
    requireEmailVerification: true,
  });

  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSettingChange = (key: keyof Settings, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography
          variant="h5"
          sx={{
            fontWeight: 700,
            color: '#fff',
            mb: 0.5,
          }}
        >
          System Settings
        </Typography>
        <Typography variant="body2" sx={{ color: '#9ca3af' }}>
          Configure system-wide parameters and security settings
        </Typography>
      </Box>

      {/* Saved Alert */}
      {saved && (
        <Alert
          severity="success"
          icon={<CheckCircle />}
          sx={{
            mb: 3,
            bgcolor: 'rgba(34, 197, 94, 0.1)',
            color: '#22c55e',
            border: '1px solid #22c55e',
            '& .MuiAlert-icon': { color: '#22c55e' },
          }}
        >
          Settings saved successfully
        </Alert>
      )}

      {/* Rate Limiting Settings */}
      <Card
        sx={{
          bgcolor: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '12px',
          mb: 3,
        }}
      >
        <CardContent>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              color: '#fff',
              mb: 2,
            }}
          >
            Rate Limiting
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Max Requests Per Window"
                type="number"
                value={settings.rateLimitMaxRequests}
                onChange={(e) =>
                  handleSettingChange(
                    'rateLimitMaxRequests',
                    parseInt(e.target.value)
                  )
                }
                fullWidth
                variant="outlined"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    color: '#e5e7eb',
                    '& fieldset': {
                      borderColor: '#333',
                    },
                  },
                  '& .MuiInputBase-input': {
                    color: '#e5e7eb',
                  },
                  '& .MuiInputLabel-root': {
                    color: '#9ca3af',
                  },
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Rate Limit Window (ms)"
                type="number"
                value={settings.rateLimitWindowMs}
                onChange={(e) =>
                  handleSettingChange(
                    'rateLimitWindowMs',
                    parseInt(e.target.value)
                  )
                }
                fullWidth
                variant="outlined"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    color: '#e5e7eb',
                    '& fieldset': {
                      borderColor: '#333',
                    },
                  },
                  '& .MuiInputBase-input': {
                    color: '#e5e7eb',
                  },
                  '& .MuiInputLabel-root': {
                    color: '#9ca3af',
                  },
                }}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* JWT & Token Settings */}
      <Card
        sx={{
          bgcolor: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '12px',
          mb: 3,
        }}
      >
        <CardContent>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              color: '#fff',
              mb: 2,
            }}
          >
            JWT & Token Configuration
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="JWT Expiration (minutes)"
                type="number"
                value={settings.jwtExpirationMinutes}
                onChange={(e) =>
                  handleSettingChange(
                    'jwtExpirationMinutes',
                    parseInt(e.target.value)
                  )
                }
                fullWidth
                variant="outlined"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    color: '#e5e7eb',
                    '& fieldset': {
                      borderColor: '#333',
                    },
                  },
                  '& .MuiInputBase-input': {
                    color: '#e5e7eb',
                  },
                  '& .MuiInputLabel-root': {
                    color: '#9ca3af',
                  },
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Refresh Token Expiration (days)"
                type="number"
                value={settings.refreshTokenExpirationDays}
                onChange={(e) =>
                  handleSettingChange(
                    'refreshTokenExpirationDays',
                    parseInt(e.target.value)
                  )
                }
                fullWidth
                variant="outlined"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    color: '#e5e7eb',
                    '& fieldset': {
                      borderColor: '#333',
                    },
                  },
                  '& .MuiInputBase-input': {
                    color: '#e5e7eb',
                  },
                  '& .MuiInputLabel-root': {
                    color: '#9ca3af',
                  },
                }}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Email Verification Settings */}
      <Card
        sx={{
          bgcolor: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '12px',
          mb: 3,
        }}
      >
        <CardContent>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              color: '#fff',
              mb: 2,
            }}
          >
            Email Verification
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="OTP Length"
                type="number"
                value={settings.emailVerificationOtpLength}
                onChange={(e) =>
                  handleSettingChange(
                    'emailVerificationOtpLength',
                    parseInt(e.target.value)
                  )
                }
                fullWidth
                variant="outlined"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    color: '#e5e7eb',
                    '& fieldset': {
                      borderColor: '#333',
                    },
                  },
                  '& .MuiInputBase-input': {
                    color: '#e5e7eb',
                  },
                  '& .MuiInputLabel-root': {
                    color: '#9ca3af',
                  },
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="OTP Expiry (minutes)"
                type="number"
                value={settings.emailVerificationOtpExpiryMinutes}
                onChange={(e) =>
                  handleSettingChange(
                    'emailVerificationOtpExpiryMinutes',
                    parseInt(e.target.value)
                  )
                }
                fullWidth
                variant="outlined"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    color: '#e5e7eb',
                    '& fieldset': {
                      borderColor: '#333',
                    },
                  },
                  '& .MuiInputBase-input': {
                    color: '#e5e7eb',
                  },
                  '& .MuiInputLabel-root': {
                    color: '#9ca3af',
                  },
                }}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Security Settings */}
      <Card
        sx={{
          bgcolor: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '12px',
          mb: 3,
        }}
      >
        <CardContent>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              color: '#fff',
              mb: 2,
            }}
          >
            Security
          </Typography>
          <Box sx={{ mb: 2 }}>
            <TextField
              label="Bcrypt Rounds"
              type="number"
              value={settings.bcryptRounds}
              onChange={(e) =>
                handleSettingChange('bcryptRounds', parseInt(e.target.value))
              }
              fullWidth
              variant="outlined"
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: '#e5e7eb',
                  '& fieldset': {
                    borderColor: '#333',
                  },
                },
                '& .MuiInputBase-input': {
                  color: '#e5e7eb',
                },
                '& .MuiInputLabel-root': {
                  color: '#9ca3af',
                },
              }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* Feature Toggles */}
      <Card
        sx={{
          bgcolor: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '12px',
          mb: 3,
        }}
      >
        <CardContent>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              color: '#fff',
              mb: 2,
            }}
          >
            Feature Toggles
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.maintenanceMode}
                  onChange={(e) =>
                    handleSettingChange('maintenanceMode', e.target.checked)
                  }
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': {
                      color: '#22c55e',
                    },
                  }}
                />
              }
              label={
                <Box>
                  <Typography sx={{ color: '#e5e7eb', fontWeight: 600 }}>
                    Maintenance Mode
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: '#6b7280', display: 'block' }}
                  >
                    Disable all user access except admins
                  </Typography>
                </Box>
              }
            />
            <Divider sx={{ borderColor: '#333' }} />
            <FormControlLabel
              control={
                <Switch
                  checked={settings.allowNewRegistrations}
                  onChange={(e) =>
                    handleSettingChange('allowNewRegistrations', e.target.checked)
                  }
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': {
                      color: '#22c55e',
                    },
                  }}
                />
              }
              label={
                <Box>
                  <Typography sx={{ color: '#e5e7eb', fontWeight: 600 }}>
                    Allow New Registrations
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: '#6b7280', display: 'block' }}
                  >
                    Allow users to create new accounts
                  </Typography>
                </Box>
              }
            />
            <Divider sx={{ borderColor: '#333' }} />
            <FormControlLabel
              control={
                <Switch
                  checked={settings.requireEmailVerification}
                  onChange={(e) =>
                    handleSettingChange('requireEmailVerification', e.target.checked)
                  }
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': {
                      color: '#22c55e',
                    },
                  }}
                />
              }
              label={
                <Box>
                  <Typography sx={{ color: '#e5e7eb', fontWeight: 600 }}>
                    Require Email Verification
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: '#6b7280', display: 'block' }}
                  >
                    Users must verify email before access
                  </Typography>
                </Box>
              }
            />
          </Box>
        </CardContent>
      </Card>

      {/* Save Button */}
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button
          variant="contained"
          startIcon={<Save />}
          onClick={handleSave}
          disabled={loading}
          sx={{
            bgcolor: '#22c55e',
            color: '#000',
            fontWeight: 600,
            '&:hover': { bgcolor: '#16a34a' },
            '&:disabled': { opacity: 0.6 },
          }}
        >
          {loading ? 'Saving...' : 'Save Settings'}
        </Button>
        <Button
          variant="outlined"
          sx={{
            borderColor: '#333',
            color: '#9ca3af',
            '&:hover': { borderColor: '#22c55e', color: '#22c55e' },
          }}
        >
          Cancel
        </Button>
      </Box>
    </Box>
  );
}
