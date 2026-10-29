export const ORG_VISIBILITIES = new Set(['public', 'private']);

// API callers must not be able to invent a visibility value. Anything other
// than the two supported modes would bypass exact-match privacy checks.
export function normalizeOrgVisibility(value, fallback = 'public') {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return ORG_VISIBILITIES.has(normalized) ? normalized : null;
}
