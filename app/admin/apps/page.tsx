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
  InputAdornment,
} from '@mui/material';
import {
  MoreVert,
  Search,
  Edit,
  Delete,
  Pause
} from '@mui/icons-material';
import { useApps } from '../../../src/lib/hooks/useAdminData';

export default function AppsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { data, loading, error } = useApps(page, search);

  const handleMenuOpen = (
    event: React.MouseEvent<HTMLElement>,
    appId: string
  ) => {
    setAnchorEl(event.currentTarget);
    setSelectedApp(appId);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
    handleMenuClose();
  };

  const handleConfirmDelete = () => {
    // Implement delete logic
    console.log('Delete app:', selectedApp);
    setDeleteDialogOpen(false);
  };

  const handleToggleSuspend = (appId: string, isSuspended: boolean) => {
    // Implement suspend/activate logic
    console.log('Toggle suspend:', appId, isSuspended);
  };

  if (error) {
    return (
      <Box sx={{ color: '#ef4444' }}>
        <Typography variant="h6">Error loading applications</Typography>
        <Typography variant="body2">{error}</Typography>
      </Box>
    );
  }

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
          Applications
        </Typography>
        <Typography variant="body2" sx={{ color: '#9ca3af' }}>
          Manage all registered OAuth applications
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
            placeholder="Search apps or owner email..."
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
                    Application Name
                  </TableCell>
                  <TableCell sx={{ color: '#9ca3af', fontWeight: 600 }}>
                    Owner
                  </TableCell>
                  <TableCell sx={{ color: '#9ca3af', fontWeight: 600 }}>
                    Status
                  </TableCell>
                  <TableCell sx={{ color: '#9ca3af', fontWeight: 600 }}>
                    Requests
                  </TableCell>
                  <TableCell sx={{ color: '#9ca3af', fontWeight: 600 }}>
                    Users
                  </TableCell>
                  <TableCell sx={{ color: '#9ca3af', fontWeight: 600 }}>
                    Created
                  </TableCell>
                  <TableCell sx={{ color: '#9ca3af', fontWeight: 600 }}>
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data?.apps.map((app) => (
                  <TableRow
                    key={app.id}
                    sx={{
                      borderBottom: '1px solid #333',
                      '&:hover': { bgcolor: 'rgba(34, 197, 94, 0.05)' },
                    }}
                  >
                    <TableCell sx={{ color: '#e5e7eb' }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {app.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: '#6b7280' }}
                        >
                          {app.id}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ color: '#9ca3af' }}>
                      {app.owner.email}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={app.status}
                        size="small"
                        sx={{
                          bgcolor:
                            app.status === 'active'
                              ? 'rgba(34, 197, 94, 0.2)'
                              : 'rgba(239, 68, 68, 0.2)',
                          color:
                            app.status === 'active' ? '#22c55e' : '#ef4444',
                          fontWeight: 600,
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ color: '#e5e7eb' }}>
                      {(app.requests / 1000).toFixed(1)}K
                    </TableCell>
                    <TableCell sx={{ color: '#e5e7eb' }}>
                      {app.users}
                    </TableCell>
                    <TableCell sx={{ color: '#9ca3af' }}>
                      {new Date(app.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuOpen(e, app.id)}
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
        <MenuItem>
          <Edit fontSize="small" sx={{ mr: 1 }} />
          Edit
        </MenuItem>
        <MenuItem>
          <Pause fontSize="small" sx={{ mr: 1 }} />
          Suspend
        </MenuItem>
        <MenuItem onClick={handleDeleteClick} sx={{ color: '#ef4444' }}>
          <Delete fontSize="small" sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>

      {/* Delete Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
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
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          Are you sure you want to delete this application? This action cannot
          be undone.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleConfirmDelete}
            sx={{ color: '#ef4444' }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
