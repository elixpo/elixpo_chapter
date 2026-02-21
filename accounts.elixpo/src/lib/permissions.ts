/**
 * RBAC (Role-Based Access Control) Permissions Service
 * Manages roles, permissions, and user access control
 */

import crypto from 'crypto';
import { getDatabase } from './d1-client';

export interface Permission {
  id: string;
  name: string;
  description: string;
  resource: string;
  action: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  systemRole: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserRole {
  id: string;
  userId: string;
  roleId: string;
  assignedAt: string;
  assignedBy?: string;
}

/**
 * Get all permissions for a user
 */
export async function getUserPermissions(userId: string): Promise<Permission[]> {
  const db = await getDatabase();

  try {
    const response = await db
      .prepare(
        `SELECT DISTINCT p.* FROM permissions p
        INNER JOIN role_permissions rp ON p.id = rp.permission_id
        INNER JOIN user_roles ur ON rp.role_id = ur.role_id
        WHERE ur.user_id = ?
        ORDER BY p.resource, p.action`
      )
      .bind(userId)
      .all();

    const results = (response as any).results || response;

    return results.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      resource: row.resource,
      action: row.action,
    }));
  } catch (error) {
    console.error('Error fetching user permissions:', error);
    return [];
  }
}

/**
 * Get all roles for a user
 */
export async function getUserRoles(userId: string): Promise<Role[]> {
  const db = await getDatabase();

  try {
    const response = await db
      .prepare(
        `SELECT r.* FROM roles r
        INNER JOIN user_roles ur ON r.id = ur.role_id
        WHERE ur.user_id = ?
        ORDER BY r.name`
      )
      .bind(userId)
      .all();

    const results = (response as any).results || response;

    return results.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      systemRole: Boolean(row.system_role),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (error) {
    console.error('Error fetching user roles:', error);
    return [];
  }
}

/**
 * Check if user has a specific permission
 */
export async function hasPermission(
  userId: string,
  permissionName: string
): Promise<boolean> {
  const db = await getDatabase();

  try {
    const result = await db
      .prepare(
        `SELECT 1 FROM permissions p
        INNER JOIN role_permissions rp ON p.id = rp.permission_id
        INNER JOIN user_roles ur ON rp.role_id = ur.role_id
        WHERE ur.user_id = ? AND p.name = ?
        LIMIT 1`
      )
      .bind(userId, permissionName)
      .first();

    return result !== null;
  } catch (error) {
    console.error('Error checking permission:', error);
    return false;
  }
}

/**
 * Check if user has permission by resource and action
 */
export async function hasResourceAccess(
  userId: string,
  resource: string,
  action: string
): Promise<boolean> {
  const db = await getDatabase();

  try {
    const result = await db
      .prepare(
        `SELECT 1 FROM permissions p
        INNER JOIN role_permissions rp ON p.id = rp.permission_id
        INNER JOIN user_roles ur ON rp.role_id = ur.role_id
        WHERE ur.user_id = ? AND p.resource = ? AND p.action = ?
        LIMIT 1`
      )
      .bind(userId, resource, action)
      .first();

    return result !== null;
  } catch (error) {
    console.error('Error checking resource access:', error);
    return false;
  }
}

/**
 * Check if user has any of the specified permissions
 */
export async function hasAnyPermission(
  userId: string,
  permissionNames: string[]
): Promise<boolean> {
  if (permissionNames.length === 0) return false;

  const db = await getDatabase();
  const placeholders = permissionNames.map(() => '?').join(',');

  try {
    const result = await db
      .prepare(
        `SELECT 1 FROM permissions p
        INNER JOIN role_permissions rp ON p.id = rp.permission_id
        INNER JOIN user_roles ur ON rp.role_id = ur.role_id
        WHERE ur.user_id = ? AND p.name IN (${placeholders})
        LIMIT 1`
      )
      .bind(userId, ...permissionNames)
      .first();

    return result !== null;
  } catch (error) {
    console.error('Error checking any permission:', error);
    return false;
  }
}

/**
 * Check if user has all specified permissions
 */
export async function hasAllPermissions(
  userId: string,
  permissionNames: string[]
): Promise<boolean> {
  if (permissionNames.length === 0) return true;

  const userPermissions = await getUserPermissions(userId);
  const userPermNames = userPermissions.map((p) => p.name);

  return permissionNames.every((perm) => userPermNames.includes(perm));
}

/**
 * Assign a role to a user
 */
export async function assignRoleToUser(
  userId: string,
  roleId: string,
  assignedByUserId?: string
): Promise<UserRole | null> {
  const db = await getDatabase();
  const id = crypto.randomUUID();

  try {
    await db
      .prepare(
        `INSERT INTO user_roles (id, user_id, role_id, assigned_by)
        VALUES (?, ?, ?, ?)`
      )
      .bind(id, userId, roleId, assignedByUserId || null)
      .run();

    return {
      id,
      userId,
      roleId,
      assignedAt: new Date().toISOString(),
      assignedBy: assignedByUserId,
    };
  } catch (error) {
    console.error('Error assigning role:', error);
    return null;
  }
}

/**
 * Remove a role from a user
 */
export async function removeRoleFromUser(userId: string, roleId: string): Promise<boolean> {
  const db = await getDatabase();

  try {
    const result = await db
      .prepare('DELETE FROM user_roles WHERE user_id = ? AND role_id = ?')
      .bind(userId, roleId)
      .run();

    return result.meta?.changes > 0;
  } catch (error) {
    console.error('Error removing role:', error);
    return false;
  }
}

/**
 * Create a custom role
 */
export async function createRole(
  name: string,
  description: string,
  permissions: string[]
): Promise<Role | null> {
  const db = await getDatabase();
  const id = `role-${crypto.randomUUID()}`;

  try {
    await db
      .prepare(
        `INSERT INTO roles (id, name, description, system_role)
        VALUES (?, ?, ?, 0)`
      )
      .bind(id, name, description)
      .run();

    // Assign permissions to role
    for (const permId of permissions) {
      const rpId = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO role_permissions (id, role_id, permission_id)
          VALUES (?, ?, ?)`
        )
        .bind(rpId, id, permId)
        .run();
    }

    return {
      id,
      name,
      description,
      systemRole: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error creating role:', error);
    return null;
  }
}

/**
 * Update a custom role
 */
export async function updateRole(
  roleId: string,
  name: string,
  description: string
): Promise<Role | null> {
  const db = await getDatabase();

  try {
    await db
      .prepare(
        `UPDATE roles SET name = ?, description = ?, updated_at = ?
        WHERE id = ? AND system_role = 0`
      )
      .bind(name, description, new Date().toISOString(), roleId)
      .run();

    const updated = await db
      .prepare('SELECT * FROM roles WHERE id = ?')
      .bind(roleId)
      .first() as any;

    if (!updated) return null;

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      systemRole: Boolean(updated.system_role),
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };
  } catch (error) {
    console.error('Error updating role:', error);
    return null;
  }
}

/**
 * Delete a custom role
 */
export async function deleteRole(roleId: string): Promise<boolean> {
  const db = await getDatabase();

  try {
    const role = await db
      .prepare('SELECT system_role FROM roles WHERE id = ?')
      .bind(roleId)
      .first() as any;

    if (role?.system_role) {
      throw new Error('Cannot delete system roles');
    }

    const result = await db
      .prepare('DELETE FROM roles WHERE id = ? AND system_role = 0')
      .bind(roleId)
      .run();

    return result.meta?.changes > 0;
  } catch (error) {
    console.error('Error deleting role:', error);
    return false;
  }
}

/**
 * Get all roles
 */
export async function getAllRoles(): Promise<Role[]> {
  const db = await getDatabase();

  try {
    const response = await db
      .prepare('SELECT * FROM roles ORDER BY name')
      .all();

    const results = (response as any).results || response;

    return results.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      systemRole: Boolean(row.system_role),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (error) {
    console.error('Error fetching roles:', error);
    return [];
  }
}

/**
 * Get all permissions
 */
export async function getAllPermissions(): Promise<Permission[]> {
  const db = await getDatabase();

  try {
    const response = await db
      .prepare('SELECT * FROM permissions ORDER BY resource, action')
      .all();

    const results = (response as any).results || response;

    return results.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      resource: row.resource,
      action: row.action,
    }));
  } catch (error) {
    console.error('Error fetching permissions:', error);
    return [];
  }
}

/**
 * Get permissions for a specific role
 */
export async function getRolePermissions(roleId: string): Promise<Permission[]> {
  const db = await getDatabase();

  try {
    const response = await db
      .prepare(
        `SELECT p.* FROM permissions p
        INNER JOIN role_permissions rp ON p.id = rp.permission_id
        WHERE rp.role_id = ?
        ORDER BY p.resource, p.action`
      )
      .bind(roleId)
      .all();

    const results = (response as any).results || response;

    return results.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      resource: row.resource,
      action: row.action,
    }));
  } catch (error) {
    console.error('Error fetching role permissions:', error);
    return [];
  }
}

/**
 * Update role permissions
 */
export async function updateRolePermissions(
  roleId: string,
  permissionIds: string[]
): Promise<boolean> {
  const db = await getDatabase();

  try {
    // Delete existing permissions
    await db
      .prepare('DELETE FROM role_permissions WHERE role_id = ?')
      .bind(roleId)
      .run();

    // Add new permissions
    for (const permId of permissionIds) {
      const id = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO role_permissions (id, role_id, permission_id)
          VALUES (?, ?, ?)`
        )
        .bind(id, roleId, permId)
        .run();
    }

    return true;
  } catch (error) {
    console.error('Error updating role permissions:', error);
    return false;
  }
}

/**
 * Check if user is super admin (shortcut for common check)
 */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  const roles = await getUserRoles(userId);
  return roles.some((role) => role.id === 'role-super-admin');
}

/**
 * Check if user is admin
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const roles = await getUserRoles(userId);
  return roles.some(
    (role) => role.id === 'role-super-admin' || role.id === 'role-admin'
  );
}
