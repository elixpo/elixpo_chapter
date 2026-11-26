// Shared visibility check for org read paths. Private orgs are readable by
// their owner and members only; everything else is treated as public.
export function isPrivateOrg(org) {
  return String(org?.visibility || '').toLowerCase() === 'private';
}

export async function canViewOrg(db, org, userId) {
  if (!org) return false;
  if (!isPrivateOrg(org)) return true;
  if (!userId) return false;
  if (org.owner_id === userId) return true;
  const member = await db
    .prepare('SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ?')
    .bind(org.id, userId)
    .first();
  return Boolean(member);
}
