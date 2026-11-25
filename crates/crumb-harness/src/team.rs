//! Live status of the helper agents a session has started, for the agent map.

use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

/// Helpers remembered per session; the oldest finished ones are dropped.
const MAX_HELPERS: usize = 32;

/// Where a helper agent stands.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HelperState {
    Working,
    Done,
    Failed,
}

/// One helper agent as the agent map shows it.
#[derive(Clone, Debug)]
pub struct HelperStatus {
    pub name: String,
    pub logo: String,
    pub task: String,
    pub write: bool,
    pub state: HelperState,
    pub tokens: u64,
    /// The latest thing it did, such as `Searching · search_code`.
    pub activity: String,
    started: Instant,
    finished: Option<Instant>,
}

impl HelperStatus {
    #[must_use]
    pub fn elapsed(&self) -> Duration {
        self.finished
            .unwrap_or_else(Instant::now)
            .saturating_duration_since(self.started)
    }
}

/// Shared, cheap-to-clone registry of a session's helper agents.
#[derive(Clone, Default)]
pub struct TeamRegistry {
    helpers: Arc<Mutex<Vec<(u64, HelperStatus)>>>,
    next: Arc<Mutex<u64>>,
}

impl TeamRegistry {
    #[must_use]
    pub fn snapshot(&self) -> Vec<HelperStatus> {
        self.lock()
            .iter()
            .map(|(_, helper)| helper.clone())
            .collect()
    }

    #[must_use]
    pub fn working(&self) -> usize {
        self.lock()
            .iter()
            .filter(|(_, helper)| helper.state == HelperState::Working)
            .count()
    }

    pub(crate) fn begin(&self, name: &str, logo: &str, task: &str, write: bool) -> u64 {
        let id = {
            let mut next = self
                .next
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            *next += 1;
            *next
        };
        let mut helpers = self.lock();
        helpers.push((
            id,
            HelperStatus {
                name: name.to_owned(),
                logo: logo.to_owned(),
                task: task.to_owned(),
                write,
                state: HelperState::Working,
                tokens: 0,
                activity: "Starting".to_owned(),
                started: Instant::now(),
                finished: None,
            },
        ));
        while helpers.len() > MAX_HELPERS {
            let Some(index) = helpers
                .iter()
                .position(|(_, helper)| helper.state != HelperState::Working)
            else {
                break;
            };
            helpers.remove(index);
        }
        id
    }

    pub(crate) fn update(&self, id: u64, change: impl FnOnce(&mut HelperStatus)) {
        if let Some((_, helper)) = self.lock().iter_mut().find(|(entry, _)| *entry == id) {
            change(helper);
        }
    }

    pub(crate) fn finish(&self, id: u64, failed: bool) {
        self.update(id, |helper| {
            helper.state = if failed {
                HelperState::Failed
            } else {
                HelperState::Done
            };
            helper.finished = Some(Instant::now());
        });
    }

    fn lock(&self) -> MutexGuard<'_, Vec<(u64, HelperStatus)>> {
        self.helpers
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

#[cfg(test)]
mod tests {
    use super::{HelperState, TeamRegistry};

    #[test]
    fn helpers_are_tracked_from_start_to_finish() {
        let team = TeamRegistry::default();
        let first = team.begin("Koi", "◆", "review PR 530", false);
        let second = team.begin("Nyx", "●", "fix the parser", true);
        team.update(first, |helper| {
            helper.tokens += 1_200;
            helper.activity = "Reading · read_file".to_owned();
        });
        team.finish(second, true);
        let helpers = team.snapshot();
        assert_eq!(team.working(), 1);
        assert_eq!(helpers[0].tokens, 1_200);
        assert_eq!(helpers[0].activity, "Reading · read_file");
        assert_eq!(helpers[1].state, HelperState::Failed);
        assert!(helpers[1].write);
    }
}
