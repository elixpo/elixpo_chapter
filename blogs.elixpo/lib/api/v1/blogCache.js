export async function invalidateBlogLifecycleCaches(blogId, author = null) {
  try {
    const { kvInvalidate, PUBLIC_SITEMAP_CACHE_KEY } = await import('../../cache');
    const contributionKeys = [];
    if (author?.username) {
      // Build keys exactly as the contributions route does: it canonicalises
      // the zone (e.g. Asia/Kolkata -> Asia/Calcutta), so the raw stored
      // value would miss the cached entry.
      const { normalizeTimezone } = await import('../../contributions.js');
      const name = String(author.username).toLowerCase();
      const zones = new Set(['UTC', normalizeTimezone(author.timezone || 'UTC')]);
      for (const zone of zones) contributionKeys.push(`v1:contributions:${name}:${zone}`);
    }
    await kvInvalidate(
      PUBLIC_SITEMAP_CACHE_KEY,
      'v1:tags:popular:v2:30',
      'v1:tags:popular:v2:12',
      'v1:trending:3',
      'v1:trending:5',
      'v1:trending:10',
      'v1:feed:anon:trending:p1',
      `v1:interactions:${blogId}`,
      ...contributionKeys,
    );
  } catch (error) {
    console.error('[api/v1/blogs] cache invalidation failed:', error?.message || error);
  }
}
