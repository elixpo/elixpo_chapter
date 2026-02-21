'use client';

import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  InputAdornment,
  Grid,
} from '@mui/material';
import {
  Search,
  Info,
  Warning,
  CheckCircle,
  Error,
} from '@mui/icons-material';

interface AdminLog {
  id: string;
  adminId: string;
  adminEmail: string;
  action: string;
  resourceType: string;
  resourceId: string;
  changes: string;
  timestamp: string;
  status: 'success' | 'failed';
}

export default function LogsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<AdminLog[]>([
    {
      id: 'log_1',
      adminId: 'admin_1',
      adminEmail: 'admin@elixpo.com',
      action: 'user_suspended',
      resourceType: 'user',
      resourceId: 'user_123',
      changes: 'is_active: true -> false',
      timestamp: '2025-12-16T15:30:00Z',
      status: 'success',
    },
    {
      id: 'log_2',
      adminId: 'admin_1',
      adminEmail: 'admin@elixpo.com',
      action: 'app_deleted',
      resourceType: 'app',
      resourceId: 'app_456',
      changes: 'Removed OAuth client',
      timestamp: '2025-12-16T14:20:00Z',
      status: 'success',
    },
    {
      id: 'log_3',
      adminId: 'admin_1',
      adminEmail: 'admin@elixpo.com',
      action: 'config_updated',
      resourceType: 'system',
      resourceId: 'config',
      changes: 'rate_limit_max: 100 -> 150',
      timestamp: '2025-12-16T12:45:00Z',
      status: 'success',
    },
  ]);

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'user_suspended':
        return <Warning sx={{ color: '#f59e0b' }} />;
      case 'app_deleted':
        return <Error sx={{ color: '#ef4444' }} />;
      case 'admin_role_granted':
        return <CheckCircle sx={{ color: '#22c55e' }} />;
      default:
        return <Info sx={{ color: '#3b82f6' }} />;
    }
  };

  const getActionLabel = (action: string) => {
    return action
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getActionColor = (action: string): string => {
    switch (action) {
      case 'user_suspended':
        return '#f59e0b';
      case 'app_deleted':
        return '#ef4444';
      case 'admin_role_granted':
        return '#22c55e';
      default:
        return '#3b82f6';
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
          Activity Logs
        </Typography>
        <Typography variant="body2" sx={{ color: '#9ca3af' }}>
          View all admin actions and system events
        </Typography>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card
            sx={{
              bgcolor: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '12px',
            }}
          >
            <CardContent>
              <Typography variant="body2" sx={{ color: '#9ca3af', mb: 1 }}>
                Total Actions
              </Typography>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 700,
                  color: '#fff',
                }}
              >
                1,248
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card
            sx={{
              bgcolor: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '12px',
            }}
          >
            <CardContent>
              <Typography variant="body2" sx={{ color: '#9ca3af', mb: 1 }}>
                Success Rate
              </Typography>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 700,
                  color: '#22c55e',
                }}
              >
                99.8%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card
            sx={{
              bgcolor: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '12px',
            }}
          >
            <CardContent>
              <Typography variant="body2" sx={{ color: '#9ca3af', mb: 1 }}>
                Active Admins
              </Typography>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 700,
                  color: '#3b82f6',
                }}
              >
                5
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card
            sx={{
              bgcolor: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '12px',
            }}
          >
            <CardContent>
              <Typography variant="body2" sx={{ color: '#9ca3af', mb: 1 }}>
                Failed Actions
              </Typography>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 700,
                  color: '#ef4444',
                }}
              >
                3
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Search Bar */}
      <Card
        sx={{
          bgcolor: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '12px',
          mb: 3,
        }}
      >
        <CardContent>
          <TextField
            placeholder="Search by admin email, action, or resource..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
            variant="outlined"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search sx={{ color: '#6b7280', mr: 1 }} />
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                color: '#e5e7eb',
                '& fieldset': {
                  borderColor: '#333',
                },
                '&:hover fieldset': {
                  borderColor: '#22c55e',
                },
              },
              '& .MuiOutlinedInput-input::placeholder': {
                color: '#6b7280',
                opacity: 1,
              },
            }}
          />
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card
        sx={{
          bgcolor: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '300px',
            }}
          >
            <CircularProgress sx={{ color: '#22c55e' }} />
          </Box>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#111', borderBottom: '1px solid #333' }}>
                  <TableCell sx={{ color: '#9ca3af', fontWeight: 600 }}>
                    Action
                  </TableCell>
                  <TableCell sx={{ color: '#9ca3af', fontWeight: 600 }}>
                    Admin
                  </TableCell>
                  <TableCell sx={{ color: '#9ca3af', fontWeight: 600 }}>
                    Resource
                  </TableCell>
                  <TableCell sx={{ color: '#9ca3af', fontWeight: 600 }}>
                    Changes
                  </TableCell>
                  <TableCell sx={{ color: '#9ca3af', fontWeight: 600 }}>
                    Status
                  </TableCell>
                  <TableCell sx={{ color: '#9ca3af', fontWeight: 600 }}>
                    Timestamp
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.map((log) => (
                  <TableRow
                    key={log.id}
                    sx={{
                      borderBottom: '1px solid #333',
                      '&:hover': { bgcolor: 'rgba(34, 197, 94, 0.05)' },
                    }}
                  >
                    <TableCell sx={{ color: '#e5e7eb' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getActionIcon(log.action)}
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {getActionLabel(log.action)}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ color: '#6b7280' }}
                          >
                            {log.id}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ color: '#9ca3af' }}>
                      {log.adminEmail}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={`${log.resourceType}:${log.resourceId}`}
                        size="small"
                        sx={{
                          bgcolor: 'rgba(59, 130, 246, 0.2)',
                          color: '#3b82f6',
                          fontSize: '0.75rem',
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ color: '#9ca3af' }}>
                      <Typography variant="caption">{log.changes}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={log.status}
                        size="small"
                        sx={{
                          bgcolor:
                            log.status === 'success'
                              ? 'rgba(34, 197, 94, 0.2)'
                              : 'rgba(239, 68, 68, 0.2)',
                          color: log.status === 'success' ? '#22c55e' : '#ef4444',
                          fontWeight: 600,
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ color: '#9ca3af' }}>
                      <Typography variant="caption">
                        {new Date(log.timestamp).toLocaleString()}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Card>
    </Box>
  );
}
