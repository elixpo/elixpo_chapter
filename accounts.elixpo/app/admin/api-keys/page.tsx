'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  ContentCopy as ContentCopyIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material';

interface ApiKey {
  id: string;
  name: string;
  description?: string;
  prefix: string;
  scopes: Record<string, boolean>;
  lastUsedAt?: string;
  createdAt: string;
  expiresAt?: string;
  revoked: boolean;
}

interface NewApiKey {
  key: string;
  apiKey: ApiKey;
}

const AVAILABLE_SCOPES = [
  { key: 'auth:read', label: 'Read Auth' },
  { key: 'auth:write', label: 'Write Auth' },
  { key: 'users:read', label: 'Read Users' },
  { key: 'users:write', label: 'Write Users' },
  { key: 'apps:read', label: 'Read Apps' },
  { key: 'apps:write', label: 'Write Apps' },
  { key: 'analytics:read', label: 'Read Analytics' },
  { key: 'webhooks:read', label: 'Read Webhooks' },
  { key: 'webhooks:write', label: 'Write Webhooks' },
  { key: 'admin:read', label: 'Read Admin' },
  { key: 'admin:write', label: 'Write Admin' },
];

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [newKeyData, setNewKeyData] = useState<NewApiKey | null>(null);
  const [showNewKey, setShowNewKey] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    expiresIn: '',
    scopes: {} as Record<string, boolean>,
  });

  // Initialize scopes
  useEffect(() => {
    const defaultScopes: Record<string, boolean> = {};
    AVAILABLE_SCOPES.forEach((scope) => {
      defaultScopes[scope.key] = false;
    });
    setFormData((prev) => ({ ...prev, scopes: defaultScopes }));
  }, []);

  // Fetch API keys
  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('jwt_token');
      const response = await fetch('/api/admin/api-keys', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch API keys');
      const data = await response.json();
      setApiKeys(data.data || []);
      setError(null);
    } catch (err) {
      setError('Failed to load API keys');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateApiKey = async () => {
    if (!formData.name.trim()) {
      setError('API key name is required');
      return;
    }

    if (!Object.values(formData.scopes).some((v) => v)) {
      setError('Please select at least one scope');
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('jwt_token');
      const response = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || undefined,
          expiresIn: formData.expiresIn || undefined,
          scopes: formData.scopes,
        }),
      });

      if (!response.ok) throw new Error('Failed to create API key');
      const data = await response.json();
      
      setNewKeyData(data);
      setFormData({
        name: '',
        description: '',
        expiresIn: '',
        scopes: AVAILABLE_SCOPES.reduce((acc, s) => ({ ...acc, [s.key]: false }), {}),
      });
      
      await fetchApiKeys();
    } catch (err) {
      setError('Failed to create API key');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeApiKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key?')) return;

    try {
      const token = localStorage.getItem('jwt_token');
      const response = await fetch(`/api/admin/api-keys?id=${keyId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'revoke' }),
      });

      if (!response.ok) throw new Error('Failed to revoke API key');
      setSuccessMessage('API key revoked successfully');
      await fetchApiKeys();
    } catch (err) {
      setError('Failed to revoke API key');
      console.error(err);
    }
  };

  const handleDeleteApiKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to delete this API key?')) return;

    try {
      const token = localStorage.getItem('jwt_token');
      const response = await fetch(`/api/admin/api-keys?id=${keyId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to delete API key');
      setSuccessMessage('API key deleted successfully');
      await fetchApiKeys();
    } catch (err) {
      setError('Failed to delete API key');
      console.error(err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const formatDate = (date: string | undefined) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString();
  };

  if (loading && apiKeys.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">API Keys</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpenCreateDialog(true)}
          sx={{ backgroundColor: '#22c55e', '&:hover': { backgroundColor: '#16a34a' } }}
        >
          Create API Key
        </Button>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {successMessage && (
        <Alert severity="success" onClose={() => setSuccessMessage(null)} sx={{ mb: 2 }}>
          {successMessage}
        </Alert>
      )}
      {copySuccess && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Copied to clipboard!
        </Alert>
      )}

      {newKeyData && (
        <Alert severity="warning" sx={{ mb: 3, p: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
            ⚠️ Save your API Key
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            This is the only time you'll see this key. Store it somewhere safe.
          </Typography>
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              alignItems: 'center',
              backgroundColor: '#1a1a1a',
              p: 1.5,
              borderRadius: 1,
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              wordBreak: 'break-all',
            }}
          >
            {showNewKey ? newKeyData.key : '•'.repeat(40)}
            <IconButton size="small" onClick={() => setShowNewKey(!showNewKey)}>
              {showNewKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
            </IconButton>
            <Tooltip title={copySuccess ? 'Copied!' : 'Copy'}>
              <IconButton size="small" onClick={() => copyToClipboard(newKeyData.key)}>
                <ContentCopyIcon />
              </IconButton>
            </Tooltip>
          </Box>
          <Button
            size="small"
            onClick={() => setNewKeyData(null)}
            sx={{ mt: 2 }}
          >
            Close & Continue
          </Button>
        </Alert>
      )}

      <TableContainer component={Paper} sx={{ backgroundColor: '#1a1a1a' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Prefix</TableCell>
              <TableCell>Scopes</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Last Used</TableCell>
              <TableCell>Expires</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {apiKeys.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                  <Typography color="textSecondary">No API keys created yet</Typography>
                </TableCell>
              </TableRow>
            ) : (
              apiKeys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell>
                    <Typography variant="body2">{key.name}</Typography>
                    {key.description && (
                      <Typography variant="caption" color="textSecondary">
                        {key.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <code style={{ backgroundColor: '#0f0f0f', padding: '2px 6px', borderRadius: '4px' }}>
                      {key.prefix}...
                    </code>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {Object.entries(key.scopes)
                        .filter(([, v]) => v)
                        .map(([scope]) => (
                          <Chip key={scope} label={scope} size="small" />
                        ))}
                    </Box>
                  </TableCell>
                  <TableCell>{formatDate(key.createdAt)}</TableCell>
                  <TableCell>{formatDate(key.lastUsedAt)}</TableCell>
                  <TableCell>{key.expiresAt ? formatDate(key.expiresAt) : '∞'}</TableCell>
                  <TableCell>
                    {key.revoked ? (
                      <Chip label="Revoked" size="small" color="error" />
                    ) : (
                      <Chip label="Active" size="small" color="success" />
                    )}
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Revoke">
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => handleRevokeApiKey(key.id)}
                          disabled={key.revoked}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteApiKey(key.id)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create API Key Dialog */}
      <Dialog open={openCreateDialog} onClose={() => setOpenCreateDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New API Key</DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <TextField
            fullWidth
            label="Key Name"
            placeholder="e.g., My Integration"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Description (Optional)"
            placeholder="What is this key for?"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            sx={{ mb: 2 }}
            multiline
            rows={2}
          />
          <TextField
            fullWidth
            label="Expires In (Days, Optional)"
            type="number"
            placeholder="Leave empty for no expiration"
            value={formData.expiresIn}
            onChange={(e) => setFormData({ ...formData, expiresIn: e.target.value })}
            sx={{ mb: 3 }}
            inputProps={{ min: 1 }}
          />

          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
            Scopes
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            {AVAILABLE_SCOPES.map((scope) => (
              <FormControlLabel
                key={scope.key}
                control={
                  <Switch
                    checked={formData.scopes[scope.key] || false}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        scopes: {
                          ...formData.scopes,
                          [scope.key]: e.target.checked,
                        },
                      })
                    }
                  />
                }
                label={scope.label}
              />
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCreateDialog(false)}>Cancel</Button>
          <Button
            onClick={handleCreateApiKey}
            variant="contained"
            sx={{ backgroundColor: '#22c55e', '&:hover': { backgroundColor: '#16a34a' } }}
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} /> : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
