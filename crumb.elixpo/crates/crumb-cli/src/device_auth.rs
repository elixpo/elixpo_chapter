use std::io::{IsTerminal, Write};
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

use anyhow::{Context, Result, bail};
use crumb_auth::SecretString;
use reqwest::StatusCode;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use url::Url;

const DEFAULT_CRUMB_ORIGIN: &str = "https://crumb.elixpo.com";
const DEVICE_GRANT: &str = "urn:ietf:params:oauth:grant-type:device_code";

#[derive(Deserialize)]
struct TerminalConfig {
    accounts_origin: String,
    client_id: String,
    audience: String,
    scopes: Vec<String>,
}

#[derive(Serialize)]
struct DeviceRequest<'a> {
    client_id: &'a str,
    audience: &'a str,
    scope: String,
}

#[derive(Deserialize)]
struct AuthorizationChallenge {
    device_code: String,
    user_code: String,
    verification_uri: String,
    verification_uri_complete: Option<String>,
    expires_in: u64,
    interval: u64,
}

#[derive(Deserialize)]
struct DeviceToken {
    access_token: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct ConnectorResponse {
    access_token: String,
}

/// Authenticates a crumb.elixpo account and returns its linked Pollinations credential.
///
/// # Errors
///
/// Returns an error when Accounts rejects or times out the device grant, the
/// user has not linked Pollinations, or Crumb returns an invalid connector.
pub(crate) fn connect(writer: &mut dyn Write) -> Result<SecretString> {
    let crumb = trusted_origin(
        &std::env::var("CRUMB_ACCOUNT_URL").unwrap_or_else(|_| DEFAULT_CRUMB_ORIGIN.to_owned()),
        "CRUMB_ACCOUNT_URL",
    )?;
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()?;
    let config = client
        .get(crumb.join("/api/terminal/config")?)
        .send()
        .context("Crumb device configuration is unavailable")?
        .error_for_status()
        .context("Crumb device flow is not configured")?
        .json::<TerminalConfig>()
        .context("Crumb returned invalid device configuration")?;
    let accounts = trusted_origin(&config.accounts_origin, "Accounts origin")?;
    let device = client
        .post(accounts.join("/api/auth/device/authorize")?)
        .json(&DeviceRequest {
            client_id: &config.client_id,
            audience: &config.audience,
            scope: config.scopes.join(" "),
        })
        .send()
        .context("could not start Accounts device authorization")?
        .error_for_status()
        .context("Accounts rejected the Crumb CLI registration")?
        .json::<AuthorizationChallenge>()
        .context("Accounts returned an invalid device challenge")?;

    let verification_url = device
        .verification_uri_complete
        .as_deref()
        .unwrap_or(&device.verification_uri);
    writeln!(writer, "Connect your crumb.elixpo account in your browser:")?;
    writeln!(writer, "{verification_url}")?;
    writeln!(writer, "Device code: {}", device.user_code)?;
    if !open_browser(verification_url) {
        writeln!(writer, "Open the URL above manually to continue.")?;
    }
    let access_token = poll_accounts(&client, &accounts, &config.client_id, &device, writer);
    // Leave the progress line before any further output.
    if std::io::stdout().is_terminal() {
        writeln!(writer)?;
    }
    let access_token = access_token?;
    let response = client
        .post(crumb.join("/api/terminal/exchange")?)
        .bearer_auth(&access_token)
        .send()
        .context("Crumb connector exchange failed")?;
    if response.status() == StatusCode::CONFLICT {
        bail!(
            "your crumb.elixpo account is authorized, but Pollinations is not connected; enable it at {}/connect, then run `crumb auth login` again",
            crumb.origin().ascii_serialization()
        );
    }
    let connector = response
        .error_for_status()
        .context("Crumb rejected the Accounts device authorization")?
        .json::<ConnectorResponse>()
        .context("Crumb returned an invalid connector")?;
    if connector.access_token.trim().is_empty() {
        bail!("Crumb returned an empty Pollinations connector");
    }
    Ok(SecretString::new(connector.access_token))
}

fn poll_accounts(
    client: &Client,
    accounts: &Url,
    client_id: &str,
    device: &AuthorizationChallenge,
    writer: &mut dyn Write,
) -> Result<String> {
    let started = Instant::now();
    let deadline = started + Duration::from_secs(device.expires_in);
    let mut interval = Duration::from_secs(device.interval.max(1));
    let mut frame = 0_usize;
    // Redraw only on a terminal; logs and pipes get one plain line.
    let animate = std::io::stdout().is_terminal();
    if !animate {
        writeln!(writer, "Waiting for crumb.elixpo account approval…")?;
        writer.flush()?;
    }
    while Instant::now() < deadline {
        // Wait out the polling interval in short steps so the progress line
        // keeps moving.
        let poll_at = Instant::now() + interval;
        while Instant::now() < poll_at {
            if animate {
                write_waiting(writer, frame, started.elapsed())?;
            }
            frame = frame.wrapping_add(1);
            thread::sleep(PROGRESS_TICK.min(poll_at.saturating_duration_since(Instant::now())));
        }
        let response = client
            .post(accounts.join("/api/auth/token")?)
            .form(&[
                ("grant_type", DEVICE_GRANT),
                ("device_code", device.device_code.as_str()),
                ("client_id", client_id),
            ])
            .send()
            .context("Accounts device polling failed")?;
        let status = response.status();
        let payload = response
            .json::<DeviceToken>()
            .context("Accounts returned an invalid device response")?;
        if status.is_success() {
            return payload
                .access_token
                .filter(|token| !token.trim().is_empty())
                .context("Accounts returned an empty access token");
        }
        match payload.error.as_deref() {
            Some("authorization_pending") => {}
            Some("slow_down") => interval += Duration::from_secs(5),
            Some("access_denied") => bail!("Accounts device authorization was denied"),
            Some("expired_token") => bail!("Accounts device authorization expired"),
            _ => bail!("Accounts device authorization failed"),
        }
    }
    bail!("Accounts device authorization timed out")
}

/// How often the waiting line is redrawn.
const PROGRESS_TICK: Duration = Duration::from_millis(200);
const PROGRESS_FRAMES: [&str; 4] = ["◐", "◓", "◑", "◒"];

/// Rewrites the waiting line in place. A leading carriage return makes a
/// plain terminal overwrite the line; the fullscreen view replaces it.
fn write_waiting(writer: &mut dyn Write, frame: usize, elapsed: Duration) -> Result<()> {
    // One write, so the carriage return and its text arrive together.
    writer.write_all(waiting_line(frame, elapsed).as_bytes())?;
    writer.flush()?;
    Ok(())
}

fn waiting_line(frame: usize, elapsed: Duration) -> String {
    format!(
        "\rWaiting for crumb.elixpo account approval… {} {}s\x1b[K",
        PROGRESS_FRAMES[frame % PROGRESS_FRAMES.len()],
        elapsed.as_secs()
    )
}

fn trusted_origin(value: &str, label: &str) -> Result<Url> {
    let url = Url::parse(value).with_context(|| format!("{label} is invalid"))?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1"));
    if url.scheme() != "https" && !(local && url.scheme() == "http") {
        bail!("{label} must use HTTPS unless it is localhost");
    }
    Ok(url)
}

/// Opens `url` in the default browser. The browser's own output (GTK
/// warnings and the like) must not reach Crumb's screen, so its standard
/// streams are discarded, and the launcher is reaped in the background.
fn open_browser(url: &str) -> bool {
    #[cfg(target_os = "linux")]
    let mut command = Command::new("xdg-open");
    #[cfg(target_os = "linux")]
    command.arg(url);
    #[cfg(target_os = "macos")]
    let mut command = Command::new("open");
    #[cfg(target_os = "macos")]
    command.arg(url);
    #[cfg(target_os = "windows")]
    let mut command = Command::new("cmd");
    #[cfg(target_os = "windows")]
    command.args(["/C", "start", "", url]);
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    return false;
    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    {
        use std::process::Stdio;
        match command
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(mut child) => {
                thread::spawn(move || {
                    let _ = child.wait();
                });
                true
            }
            Err(_) => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{trusted_origin, waiting_line};
    use std::time::Duration;

    #[test]
    fn the_waiting_line_redraws_itself_with_a_spinner_and_elapsed_time() {
        let first = waiting_line(0, Duration::from_secs(3));
        let next = waiting_line(1, Duration::from_millis(4_200));
        assert!(first.starts_with('\r') && first.ends_with("\x1b[K"));
        assert!(first.contains("approval… ◐ 3s"));
        assert!(next.contains("approval… ◓ 4s"));
    }

    #[test]
    fn device_origins_require_https_except_for_local_development() {
        assert!(trusted_origin("https://accounts.elixpo.com", "origin").is_ok());
        assert!(trusted_origin("http://localhost:3000", "origin").is_ok());
        assert!(trusted_origin("http://accounts.example", "origin").is_err());
    }
}
