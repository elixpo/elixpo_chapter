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
  Button,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  InputAdornment
} from '@mui/material';
import {
  MoreVert,
  Search,
  Shield,
  Lock
} from '@mui/icons-material';
import { useUsers } from '../../../src/lib/hooks/useAdminData';

export default function UsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [currentAction, setCurrentAction] = useState<string | null>(null);
  const { data, loading, error } = useUsers(page, search);

  const handleMenuOpen = (
    event: React.MouseEvent<HTMLElement>,
    userId: string
  ) => {
    setAnchorEl(event.currentTarget);
    setSelectedUserId(userId);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleActionClick = (action: string) => {
    setCurrentAction(action);
    setActionDialogOpen(true);
    handleMenuClose();
  };

  const handleConfirmAction = async () => {
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify({
          userId: selectedUserId,
          action: currentAction,
        }),
      });

      if (response.ok) {
        console.log('Action successful');
        setActionDialogOpen(false);
        // Refresh data
      }
    } catch (error) {
      console.error('Action failed:', error);
    }
  };

  if (error) {
    return (
      <Box sx={{ color: '#ef4444' }}>
        <Typography variant="h6">Error loading users</Typography>
        <Typography variant="body2">{error}</Typography>
      </Box>
    );
  }

  const getActionTitle = (action: string | null) => {
    switch (action) {
      case 'toggle_admin':
        return 'Toggle Admin Status';
      case 'suspend':
        return 'Suspend User';
      case 'activate':
        return 'Activate User';
      default:
        return 'Confirm Action';
    }
  };

  const getActionMessage = (action: string | null) => {
    switch (action) {
      case 'toggle_admin':
        return 'This will change the admin status for this user.';
      case 'suspend':
        return 'The user account will be suspended and they will not be able to login.';
      case 'activate':
        return 'The user account will be reactivated.';
      default:
        return 'Are you sure?';
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
          Users Management
        </Typography>
        <Typography variant="body2" sx={{ color: '#9ca3af' }}>
          Manage user accounts and permissions
        </Typography>
      </Box>

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
            placeholder="Search by email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
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

      {/* Table */}
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
                    Email
                  </TableCell>
                  <TableCell sx={{ color: '#9ca3af', fontWeight: 600 }}>
                    Status
                  </TableCell>
                  <TableCell sx={{ color: '#9ca3af', fontWeight: 600 }}>
                    Role
                  </TableCell>
                  <TableCell sx={{ color: '#9ca3af', fontWeight: 600 }}>
                    Verified
                  </TableCell>
                  <TableCell sx={{ color: '#9ca3af', fontWeight: 600 }}>
                    Apps
                  </TableCell>
                  <TableCell sx={{ color: '#9ca3af', fontWeight: 600 }}>
                    Last Login
                  </TableCell>
                  <TableCell sx={{ color: '#9ca3af', fontWeight: 600 }}>
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data?.users.map((user) => (
                  <TableRow
                    key={user.id}
                    sx={{
                      borderBottom: '1px solid #333',
                      '&:hover': { bgcolor: 'rgba(34, 197, 94, 0.05)' },
                    }}
                  >
                    <TableCell sx={{ color: '#e5e7eb' }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {user.email}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: '#6b7280' }}
                        >
                          {user.id}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={user.isActive ? 'Active' : 'Inactive'}
                        size="small"
                        sx={{
                          bgcolor: user.isActive
                            ? 'rgba(34, 197, 94, 0.2)'
                            : 'rgba(239, 68, 68, 0.2)',
                          color: user.isActive ? '#22c55e' : '#ef4444',
                          fontWeight: 600,
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        icon={user.isAdmin ? <Shield /> : undefined}
                        label={user.isAdmin ? 'Admin' : 'User'}
                        size="small"
                        sx={{
                          bgcolor: user.isAdmin
                            ? 'rgba(59, 130, 246, 0.2)'
                            : 'rgba(107, 114, 128, 0.2)',
                          color: user.isAdmin ? '#3b82f6' : '#9ca3af',
                          fontWeight: 600,
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={user.emailVerified ? 'Verified' : 'Unverified'}
                        size="small"
                        variant="outlined"
                        sx={{
                          borderColor: user.emailVerified
                            ? '#22c55e'
                            : '#6b7280',
                          color: user.emailVerified ? '#22c55e' : '#9ca3af',
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ color: '#e5e7eb' }}>
                      {user.appsCount}
                    </TableCell>
                    <TableCell sx={{ color: '#9ca3af' }}>
                      {user.lastLogin
                        ? new Date(user.lastLogin).toLocaleDateString()
                        : 'Never'}
                    </TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuOpen(e, user.id)}
                        sx={{ color: '#9ca3af' }}
                      >
                        <MoreVert fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Card>

      {/* Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        slotProps={{
          paper: {
            sx: {
              bgcolor: '#1a1a1a',
              border: '1px solid #333',
              '& .MuiMenuItem-root': {
                color: '#e5e7eb',
                fontSize: '0.9rem',
                '&:hover': { bgcolor: 'rgba(34, 197, 94, 0.1)' },
              },
            },
          },
        }}
      >
        <MenuItem onClick={() => handleActionClick('toggle_admin')}>
          <Shield fontSize="small" sx={{ mr: 1 }} />
          Toggle Admin
        </MenuItem>
        <MenuItem onClick={() => handleActionClick('suspend')}>
          <Lock fontSize="small" sx={{ mr: 1 }} />
          Suspend
        </MenuItem>
        <MenuItem onClick={() => handleActionClick('activate')}>
          <Lock fontSize="small" sx={{ mr: 1 }} />
          Activate
        </MenuItem>
      </Menu>

      {/* Action Confirmation Dialog */}
      <Dialog
        open={actionDialogOpen}
        onClose={() => setActionDialogOpen(false)}
        slotProps={{
          paper: {
            sx: {
              bgcolor: '#1a1a1a',
              border: '1px solid #333',
              '& .MuiDialogTitle-root': { color: '#fff', fontWeight: 600 },
              '& .MuiDialogContent-root': { color: '#9ca3af' },
            },
          },
        }}
      >
        <DialogTitle>{getActionTitle(currentAction)}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            {getActionMessage(currentAction)}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActionDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleConfirmAction}
            sx={{ color: '#22c55e', fontWeight: 600 }}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
