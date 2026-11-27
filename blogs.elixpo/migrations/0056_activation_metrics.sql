CREATE TABLE IF NOT EXISTS activation_events (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone TEXT NOT NULL CHECK (milestone IN (
    'signup', 'completed_profile', 'first_draft', 'first_publication'
  )),
  occurred_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, milestone)
);

CREATE INDEX IF NOT EXISTS idx_activation_events_milestone_time
  ON activation_events(milestone, occurred_at);
