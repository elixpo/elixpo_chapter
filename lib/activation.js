export const ACTIVATION_MILESTONES = [
  'signup',
  'completed_profile',
  'first_draft',
  'first_publication',
];

export async function recordActivationMilestone(db, userId, milestone) {
  if (!userId || !ACTIVATION_MILESTONES.includes(milestone)) return false;
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(`
    INSERT OR IGNORE INTO activation_events (user_id, milestone, occurred_at)
    VALUES (?, ?, ?)
  `).bind(userId, milestone, now).run();
  return true;
}

export function activationConversion(counts) {
  const signup = counts.signup || 0;
  return {
    signup,
    completedProfile: counts.completed_profile || 0,
    firstDraft: counts.first_draft || 0,
    firstPublication: counts.first_publication || 0,
    completedProfileRate: signup ? ((counts.completed_profile || 0) / signup) : 0,
    firstDraftRate: signup ? ((counts.first_draft || 0) / signup) : 0,
    firstPublicationRate: signup ? ((counts.first_publication || 0) / signup) : 0,
  };
}
