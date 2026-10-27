//! An HTTP client built on first use.
//!
//! Building a `reqwest` client loads the system's CA certificates and fails
//! when there are none, as in a minimal build chroot. Deferring that until a
//! request is made keeps tool and provider registration from failing, so
//! everything that needs no network keeps working; only the call that needs
//! the client reports the error.

use std::sync::{Arc, OnceLock};

use reqwest::{Client, ClientBuilder};

#[derive(Clone)]
pub(crate) struct LazyClient {
    configure: Arc<dyn Fn() -> ClientBuilder + Send + Sync>,
    client: Arc<OnceLock<Client>>,
}

impl LazyClient {
    pub(crate) fn new(configure: impl Fn() -> ClientBuilder + Send + Sync + 'static) -> Self {
        Self {
            configure: Arc::new(configure),
            client: Arc::default(),
        }
    }

    /// The client, built now if this is the first request.
    pub(crate) fn get(&self) -> reqwest::Result<&Client> {
        if let Some(client) = self.client.get() {
            return Ok(client);
        }
        let client = (self.configure)().build()?;
        Ok(self.client.get_or_init(|| client))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use reqwest::Client;

    use super::LazyClient;

    #[test]
    fn the_client_is_built_once_and_only_when_first_used() {
        let builds = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&builds);
        let lazy = LazyClient::new(move || {
            counter.fetch_add(1, Ordering::SeqCst);
            Client::builder()
        });
        let copy = lazy.clone();
        assert_eq!(builds.load(Ordering::SeqCst), 0);
        lazy.get().expect("client builds");
        copy.get().expect("client is shared");
        assert_eq!(builds.load(Ordering::SeqCst), 1);
    }
}
