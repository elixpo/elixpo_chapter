'use client';

import { Box, Button, TextField, Typography, Dialog, DialogTitle, DialogContent, DialogActions, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, IconButton, Chip, Alert } from '@mui/material';
import { useState, useEffect } from 'react';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';

interface OAuthApp {
  client_id: string;
  name: string;
  created_at: string;
  is_active: boolean;
  redirect_uris?: string[];
}

interface CreateAppResponse {
  client_id: string;
  client_secret: string;
  name: string;
  redirect_uris: string[];
  scopes: string[];
  created_at: string;
}

const textFieldSx = {
  '& .MuiOutlinedInput-root': {
    color: '#f5f5f4',
    background: 'transparent',
    '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
    '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.2)' },
    '&.Mui-focused fieldset': { borderColor: '#a3e635' },
  },
  '& .MuiInputLabel-root': { color: 'rgba(255, 255, 255, 0.7)' },
  '& .MuiInputLabel-root.Mui-focused': { color: '#a3e635' },
};

const tableHeadSx = {
  '& .MuiTableCell-head': {
    color: '#a3e635',
    fontWeight: 600,
    backgroundColor: 'rgba(163, 230, 53, 0.05)',
    borderColor: 'rgba(163, 230, 53, 0.2)',
  },
};

const tableBodySx = {
  '& .MuiTableCell-body': {
    color: '#f5f5f4',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  '& .MuiTableRow-root:hover': {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
};

const OAuthAppsPage = () => {
  const [apps, setApps] = useState<OAuthApp[]>([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [openSecretDialog, setOpenSecretDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [appLoading, setAppLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [newAppData, setNewAppData] = useState<CreateAppResponse | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [idCopied, setIdCopied] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    redirectUri: '',
    scopes: 'openid profile email',
  });

  useEffect(() => {
    fetchApps();
  }, []);

  const fetchApps = async () => {
    try {
      setAppLoading(true);
      const response = await fetch('/api/auth/oauth-apps');
      if (!response.ok) throw new Error('Failed to fetch applications');
      const data = await response.json();
      setApps(data.apps || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load applications');
    } finally {
      setAppLoading(false);
    }
  };

  const handleCreateApp = async () => {
    setError('');
    setLoading(true);

    if (!formData.name.trim()) {
      setError('Application name is required');
      setLoading(false);
      return;
    }

    if (!formData.redirectUri.trim()) {
      setError('Redirect URI is required');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/oauth-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          redirect_uris: [formData.redirectUri],
          scopes: formData.scopes.split(' ').filter(s => s),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create application');
      }

      const data = await response.json();
      setNewAppData(data);
      setOpenSecretDialog(true);
      setOpenDialog(false);
      setFormData({ name: '', redirectUri: '', scopes: 'openid profile email' });
      setSuccessMessage('Application created successfully!');
      await fetchApps();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create application');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToClipboard = (text: string, type: 'secret' | 'id') => {
    navigator.clipboard.writeText(text);
    if (type === 'secret') {
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    } else {
      setIdCopied(true);
      setTimeout(() => setIdCopied(false), 2000);
    }
  };

  const handleDeleteApp = async (clientId: string) => {
    if (!confirm('Are you sure? This action cannot be undone.')) return;

    try {
      const response = await fetch(`/api/auth/oauth-clients/${clientId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete application');
      
      setSuccessMessage('Application deleted successfully');
      await fetchApps();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete application');
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0c0f0a 0%, #0f1410 50%, #0c0f0a 100%)', p: 3 }}>
      <Box sx={{ maxWidth: '1200px', mx: 'auto' }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#f5f5f4', mb: 1 }}>
            OAuth Applications
          </Typography>
          <Typography sx={{ color: 'rgba(255, 255, 255, 0.6)' }}>
            Register and manage OAuth applications for your integrations
          </Typography>
        </Box>

        {/* Messages */}
        {error && (
          <Alert severity="error" sx={{ mb: 2, backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
            {error}
          </Alert>
        )}
        {successMessage && (
          <Alert severity="success" sx={{ mb: 2, backgroundColor: 'rgba(163, 230, 53, 0.1)', color: '#a3e635', borderColor: 'rgba(163, 230, 53, 0.3)' }}>
            {successMessage}
          </Alert>
        )}

        {/* Create App Button */}
        <Box sx={{ mb: 3 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setOpenDialog(true)}
            sx={{
              background: 'rgba(163, 230, 53, 0.15)',
              color: '#a3e635',
              border: '1px solid rgba(163, 230, 53, 0.3)',
              fontWeight: 600,
              textTransform: 'none',
              fontSize: '1rem',
              py: 1.2,
              px: 3,
              '&:hover': {
                background: 'rgba(163, 230, 53, 0.25)',
                borderColor: 'rgba(163, 230, 53, 0.5)',
              },
            }}
          >
            Create New Application
          </Button>
        </Box>

        {/* Applications Table */}
        <Box
          sx={{
            backdropFilter: 'blur(20px)',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            overflow: 'hidden',
          }}
        >
          {appLoading ? (
            <Box sx={{ p: 3, textAlign: 'center', color: 'rgba(255, 255, 255, 0.5)' }}>
              Loading applications...
            </Box>
          ) : apps.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center', color: 'rgba(255, 255, 255, 0.5)' }}>
              No applications registered yet. Click "Create New Application" to get started.
            </Box>
          ) : (
            <TableContainer component={Paper} sx={{ background: 'transparent', boxShadow: 'none' }}>
              <Table>
                <TableHead sx={tableHeadSx}>
                  <TableRow>
                    <TableCell>Application Name</TableCell>
                    <TableCell>Client ID</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Created</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody sx={tableBodySx}>
                  {apps.map((app) => (
                    <TableRow key={app.client_id}>
                      <TableCell sx={{ fontWeight: 500 }}>{app.name}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {app.client_id.substring(0, 20)}...
                          <IconButton
                            size="small"
                            onClick={() => handleCopyToClipboard(app.client_id, 'id')}
                            sx={{ color: '#a3e635', p: 0.5 }}
                            title="Copy Client ID"
                          >
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={app.is_active ? 'Active' : 'Inactive'}
                          size="small"
                          sx={{
                            backgroundColor: app.is_active ? 'rgba(163, 230, 53, 0.2)' : 'rgba(107, 114, 128, 0.2)',
                            color: app.is_active ? '#a3e635' : '#9ca3af',
                            borderColor: app.is_active ? 'rgba(163, 230, 53, 0.3)' : 'rgba(107, 114, 128, 0.3)',
                            border: '1px solid',
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.6)' }}>
                        {new Date(app.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteApp(app.client_id)}
                          sx={{ color: '#ef4444', '&:hover': { backgroundColor: 'rgba(239, 68, 68, 0.1)' } }}
                          title="Delete Application"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </Box>

      {/* Create Application Dialog */}
      <Dialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        PaperProps={{
          sx: {
            backdropFilter: 'blur(20px)',
            background: 'linear-gradient(135deg, rgba(15,20,16,0.95) 0%, rgba(12,15,10,0.95) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
          },
        }}
      >
        <DialogTitle sx={{ color: '#f5f5f4', fontWeight: 700, borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
          Register New Application
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <TextField
            fullWidth
            label="Application Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            margin="dense"
            placeholder="My Awesome App"
            sx={textFieldSx}
            disabled={loading}
          />
          <TextField
            fullWidth
            label="Redirect URI"
            value={formData.redirectUri}
            onChange={(e) => setFormData({ ...formData, redirectUri: e.target.value })}
            margin="dense"
            placeholder="https://myapp.com/callback"
            helperText="Where users will be redirected after authentication"
            sx={{ ...textFieldSx, '& .MuiFormHelperText-root': { color: 'rgba(255, 255, 255, 0.5)' } }}
            disabled={loading}
          />
          <TextField
            fullWidth
            label="Scopes (space-separated)"
            value={formData.scopes}
            onChange={(e) => setFormData({ ...formData, scopes: e.target.value })}
            margin="dense"
            placeholder="openid profile email"
            helperText="Default scopes: openid profile email"
            sx={{ ...textFieldSx, '& .MuiFormHelperText-root': { color: 'rgba(255, 255, 255, 0.5)' } }}
            disabled={loading}
          />
          {error && (
            <Alert severity="error" sx={{ mt: 2, backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#f87171' }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', p: 2 }}>
          <Button onClick={() => setOpenDialog(false)} sx={{ color: 'rgba(255, 255, 255, 0.6)' }} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateApp}
            variant="contained"
            disabled={loading}
            sx={{
              background: 'rgba(163, 230, 53, 0.15)',
              color: '#a3e635',
              border: '1px solid rgba(163, 230, 53, 0.3)',
              '&:hover': { background: 'rgba(163, 230, 53, 0.25)' },
              '&:disabled': { color: 'rgba(255, 255, 255, 0.4)' },
            }}
          >
            {loading ? 'Creating...' : 'Create Application'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Secret Credentials Dialog */}
      <Dialog
        open={openSecretDialog}
        onClose={() => setOpenSecretDialog(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            backdropFilter: 'blur(20px)',
            background: 'linear-gradient(135deg, rgba(15,20,16,0.95) 0%, rgba(12,15,10,0.95) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
          },
        }}
      >
        <DialogTitle sx={{ color: '#f5f5f4', fontWeight: 700, borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
          ⚠️ Save Your Credentials
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Alert severity="warning" sx={{ mb: 2, backgroundColor: 'rgba(251, 146, 60, 0.1)', color: '#fed7aa', borderColor: 'rgba(251, 146, 60, 0.3)' }}>
            This is the only time you'll see the client secret. Store it securely.
          </Alert>

          {newAppData && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography sx={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.85rem', mb: 0.5 }}>
                  Application Name
                </Typography>
                <Typography sx={{ color: '#f5f5f4', fontWeight: 500 }}>
                  {newAppData.name}
                </Typography>
              </Box>

              <Box>
                <Typography sx={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.85rem', mb: 0.5 }}>
                  Client ID
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, background: 'rgba(255, 255, 255, 0.05)', p: 1.5, borderRadius: '8px', border: '1px solid rgba(163, 230, 53, 0.2)' }}>
                  <Typography sx={{ color: '#a3e635', fontFamily: 'monospace', fontSize: '0.85rem', flex: 1, wordBreak: 'break-all' }}>
                    {newAppData.client_id}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => handleCopyToClipboard(newAppData.client_id, 'id')}
                    sx={{ color: '#a3e635' }}
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Box>
                {idCopied && <Typography sx={{ color: '#a3e635', fontSize: '0.8rem', mt: 0.5 }}>✓ Copied</Typography>}
              </Box>

              <Box>
                <Typography sx={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.85rem', mb: 0.5 }}>
                  Client Secret
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, background: 'rgba(255, 255, 255, 0.05)', p: 1.5, borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <Typography sx={{ color: '#ef4444', fontFamily: 'monospace', fontSize: '0.85rem', flex: 1, wordBreak: 'break-all' }}>
                    {newAppData.client_secret}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => handleCopyToClipboard(newAppData.client_secret, 'secret')}
                    sx={{ color: '#ef4444' }}
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Box>
                {secretCopied && <Typography sx={{ color: '#ef4444', fontSize: '0.8rem', mt: 0.5 }}>✓ Copied</Typography>}
              </Box>

              <Box>
                <Typography sx={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.85rem', mb: 0.5 }}>
                  Scopes
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {newAppData.scopes.map((scope) => (
                    <Chip
                      key={scope}
                      label={scope}
                      size="small"
                      sx={{
                        backgroundColor: 'rgba(163, 230, 53, 0.1)',
                        color: '#a3e635',
                        borderColor: 'rgba(163, 230, 53, 0.2)',
                        border: '1px solid',
                      }}
                    />
                  ))}
                </Box>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', p: 2 }}>
          <Button
            onClick={() => setOpenSecretDialog(false)}
            variant="contained"
            sx={{
              background: 'rgba(163, 230, 53, 0.15)',
              color: '#a3e635',
              border: '1px solid rgba(163, 230, 53, 0.3)',
              '&:hover': { background: 'rgba(163, 230, 53, 0.25)' },
            }}
          >
            I've Saved My Credentials
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default OAuthAppsPage;
