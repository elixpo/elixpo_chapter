/**
 * API Keys Management Endpoint
 * GET: List user's API keys
 * POST: Create new API key
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '../../../../src/lib/jwt';
import {
  generateApiKey,
  getUserApiKeys,
  revokeApiKey,
  deleteApiKey,
  updateApiKey,
  ApiKeyScopes,
} from '../../../../src/lib/api-key-service';

export async function GET(request: NextRequest) {
  try {
    // Verify JWT token
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await verifyJWT(token);
    if (!decoded || !decoded.sub) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const apiKeys = await getUserApiKeys(decoded.sub);
    
    return NextResponse.json({
      success: true,
      data: apiKeys,
    });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    return NextResponse.json(
      { error: 'Failed to fetch API keys' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify JWT token
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await verifyJWT(token);
    if (!decoded || !decoded.sub) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, scopes, expiresIn } = body;

    // Validate required fields
    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Name is required and must be a string' },
        { status: 400 }
      );
    }

    if (!scopes || typeof scopes !== 'object') {
      return NextResponse.json(
        { error: 'Scopes are required' },
        { status: 400 }
      );
    }

    // Calculate expiration date
    let expiresAt: Date | undefined;
    if (expiresIn) {
      const days = parseInt(expiresIn);
      if (isNaN(days) || days < 1) {
        return NextResponse.json(
          { error: 'expiresIn must be a number of days (minimum 1)' },
          { status: 400 }
        );
      }
      expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    const { key, apiKey } = await generateApiKey(
      decoded.sub,
      name,
      scopes as ApiKeyScopes,
      expiresAt,
      description
    );

    return NextResponse.json(
      {
        success: true,
        message: 'API key created successfully. Save the key in a secure location.',
        key, // Only shown once
        apiKey,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating API key:', error);
    return NextResponse.json(
      { error: 'Failed to create API key' },
      { status: 500 }
    );
  }
}

/**
 * API Key Actions Endpoint (PATCH/DELETE)
 * PATCH: Update API key (name, description, scopes, rate limits)
 * DELETE: Delete or revoke API key
 */
export async function PATCH(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await verifyJWT(token);
    if (!decoded || !decoded.sub) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const keyId = searchParams.get('id');

    if (!keyId) {
      return NextResponse.json(
        { error: 'API key ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { action, ...updates } = body;

    if (action === 'revoke') {
      const success = await revokeApiKey(keyId, decoded.sub);
      if (!success) {
        return NextResponse.json(
          { error: 'Failed to revoke API key' },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        message: 'API key revoked successfully',
      });
    }

    // Update API key
    const updated = await updateApiKey(keyId, decoded.sub, updates);
    if (!updated) {
      return NextResponse.json(
        { error: 'API key not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Error updating API key:', error);
    return NextResponse.json(
      { error: 'Failed to update API key' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await verifyJWT(token);
    if (!decoded || !decoded.sub) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const keyId = searchParams.get('id');

    if (!keyId) {
      return NextResponse.json(
        { error: 'API key ID is required' },
        { status: 400 }
      );
    }

    const success = await deleteApiKey(keyId, decoded.sub);
    if (!success) {
      return NextResponse.json(
        { error: 'API key not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'API key deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting API key:', error);
    return NextResponse.json(
      { error: 'Failed to delete API key' },
      { status: 500 }
    );
  }
}
