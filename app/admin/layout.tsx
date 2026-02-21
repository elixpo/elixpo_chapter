'use client';

import React, { useState } from 'react';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  Badge,
  IconButton,
} from '@mui/material';
import {
  Dashboard,
  Apps,
  People,
  Settings,
  Logout,
  Notifications,
  More,
} from '@mui/icons-material';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AdminProvider, useAdminSession } from '@/src/lib/admin-context';

const DRAWER_WIDTH = 280;

interface AdminLayoutProps {
  children: React.ReactNode;
}

function AdminLayoutContent({ children }: AdminLayoutProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const pathname = usePathname();
  const { session, logout } = useAdminSession();

  const menuItems = [
    { label: 'Dashboard', icon: Dashboard, href: '/admin' },
    { label: 'Applications', icon: Apps, href: '/admin/apps' },
    { label: 'Users', icon: People, href: '/admin/users' },
    { label: 'Activity Logs', icon: Notifications, href: '/admin/logs' },
    { label: 'Settings', icon: Settings, href: '/admin/settings' },
  ];

  const isActive = (href: string) => {
    if (href === '/admin') {
      return pathname === '/admin';
    }
    return pathname.startsWith(href);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    logout();
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#0f0f0f' }}>
      {/* Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            bgcolor: '#1a1a1a',
            borderRight: '1px solid #333',
            color: '#e5e7eb',
          },
        }}
      >
        {/* Logo Section */}
        <Box
          sx={{
            p: 2.5,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            borderBottom: '1px solid #333',
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.2rem',
              fontWeight: 'bold',
              color: '#fff',
            }}
          >
            ⚡
          </Box>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              fontSize: '1.1rem',
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            ELIXPO
          </Typography>
        </Box>

        {/* Admin Label */}
        <Box sx={{ p: 2, bgcolor: '#111', borderBottom: '1px solid #333' }}>
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              textTransform: 'uppercase',
              color: '#22c55e',
              fontWeight: 600,
              fontSize: '0.7rem',
              letterSpacing: '0.1em',
              mb: 1,
            }}
          >
            Admin Panel
          </Typography>
          <Typography variant="body2" sx={{ color: '#9ca3af' }}>
            {session?.email || 'admin@elixpo.com'}
          </Typography>
        </Box>

        {/* Menu Items */}
        <List sx={{ px: 1.5, py: 2 }}>
          {menuItems.map((item) => (
            <ListItem
              key={item.href}
              component={Link}
              href={item.href}
              sx={{
                mb: 1,
                borderRadius: '8px',
                bgcolor: isActive(item.href)
                  ? 'rgba(34, 197, 94, 0.1)'
                  : 'transparent',
                borderLeft: isActive(item.href)
                  ? '3px solid #22c55e'
                  : '3px solid transparent',
                pl: isActive(item.href) ? 1.75 : 2,
                '&:hover': {
                  bgcolor: 'rgba(34, 197, 94, 0.05)',
                },
                transition: 'all 0.2s ease',
                color: isActive(item.href) ? '#22c55e' : '#d1d5db',
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 40,
                  color: isActive(item.href) ? '#22c55e' : '#9ca3af',
                }}
              >
                <item.icon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{
                  fontSize: '0.9rem',
                  fontWeight: isActive(item.href) ? 600 : 500,
                }}
              />
            </ListItem>
          ))}
        </List>

        {/* Spacer */}
        <Box sx={{ flexGrow: 1 }} />

        {/* Version Info */}
        <Box
          sx={{
            p: 2,
            borderTop: '1px solid #333',
            bgcolor: '#111',
          }}
        >
          <Typography
            variant="caption"
            sx={{ color: '#6b7280', display: 'block' }}
          >
            Version 1.0.0
          </Typography>
        </Box>
      </Drawer>

      {/* Main Content */}
      <Box
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          bgcolor: '#0f0f0f',
        }}
      >
        {/* Top Bar */}
        <AppBar
          position="static"
          sx={{
            bgcolor: '#1a1a1a',
            borderBottom: '1px solid #333',
            boxShadow: 'none',
          }}
        >
          <Toolbar>
            <Typography
              variant="h6"
              sx={{
                flexGrow: 1,
                fontWeight: 600,
                color: '#fff',
              }}
            >
              Admin Dashboard
            </Typography>

            {/* Notification Icon */}
            <IconButton
              sx={{
                color: '#9ca3af',
                '&:hover': { color: '#22c55e' },
              }}
            >
              <Badge badgeContent={3} sx={{ '& .MuiBadge-badge': { bgcolor: '#ef4444' } }}>
                <Notifications />
              </Badge>
            </IconButton>

            {/* User Menu */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                ml: 2,
                pl: 2,
                borderLeft: '1px solid #333',
              }}
            >
              <Avatar
                sx={{
                  width: 36,
                  height: 36,
                  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                A
              </Avatar>
              <IconButton
                onClick={handleMenuOpen}
                sx={{ color: '#9ca3af', p: 0 }}
              >
                <More fontSize="small" />
              </IconButton>
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
                        '&:hover': { bgcolor: 'rgba(34, 197, 94, 0.1)' },
                      },
                    },
                  },
                }}
              >
                <MenuItem>Profile</MenuItem>
                <MenuItem>Settings</MenuItem>
                <Divider sx={{ bgcolor: '#333' }} />
                <MenuItem onClick={handleLogout} sx={{ color: '#ef4444' }}>
                  Logout
                </MenuItem>
              </Menu>
            </Box>
          </Toolbar>
        </AppBar>

        {/* Page Content */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            overflow: 'auto',
            p: 3,
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <AdminProvider>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </AdminProvider>
  );
}
