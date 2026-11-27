//! Terminal notifications for long agent turns.
//!
//! When an agent turn has been running for a while, the user has often
//! switched to another window. Crumb then asks the terminal to raise a
//! desktop notification when the turn finishes or needs an approval. The
//! escape sequence depends on the terminal; anything unknown gets the
//! terminal bell, which most terminals turn into a tab or taskbar alert.
//! On Linux desktops the bell is paired with a real desktop notification
//! through `notify-send`, because many terminals (VS Code, GNOME Terminal,
//! Konsole) only play a sound for it.
//! Set `CRUMB_NOTIFICATIONS=off` to disable.

use std::io::{IsTerminal, Write};
use std::time::Duration;

/// Turns shorter than this never notify: the user is still watching.
pub(crate) const NOTIFY_AFTER: Duration = Duration::from_secs(10);

/// Notifies that a turn ended, if it ran long enough to be worth it.
pub(crate) fn turn_finished(started: std::time::Instant, succeeded: bool) {
    if started.elapsed() >= NOTIFY_AFTER {
        notify(if succeeded {
            "Crumb finished the task"
        } else {
            "Crumb stopped before finishing"
        });
    }
}

/// Raises a notification if enabled and stdout is a terminal.
pub(crate) fn notify(message: &str) {
    let stdout = std::io::stdout();
    if !stdout.is_terminal() {
        return;
    }
    let Some(sequence) = sequence(&|name| std::env::var(name).ok(), message) else {
        return;
    };
    let mut stdout = stdout.lock();
    // Best effort: a notification must never break the turn.
    let _ = stdout.write_all(sequence.as_bytes());
    let _ = stdout.flush();
    if sequence == BELL && desktop_session(&|name| std::env::var_os(name).is_some()) {
        send_desktop_notification(&sanitize(message));
    }
}

/// Whether a Linux graphical session can show desktop notifications.
fn desktop_session(is_set: &dyn Fn(&str) -> bool) -> bool {
    cfg!(target_os = "linux")
        && (is_set("WAYLAND_DISPLAY") || is_set("DISPLAY"))
        && is_set("DBUS_SESSION_BUS_ADDRESS")
}

/// Shows `message` with `notify-send`, ignoring failures and output.
fn send_desktop_notification(message: &str) {
    use std::process::{Command, Stdio};

    if let Ok(mut child) = Command::new("notify-send")
        .args(["--app-name=Crumb", "Crumb", message])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        std::thread::spawn(move || {
            let _ = child.wait();
        });
    }
}

/// Returns the escape sequence for the current terminal, or `None` when
/// notifications are disabled.
fn sequence(env: &dyn Fn(&str) -> Option<String>, message: &str) -> Option<String> {
    if env("CRUMB_NOTIFICATIONS").is_some_and(|value| {
        matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "0" | "off" | "false" | "no"
        )
    }) {
        return None;
    }
    let message = sanitize(message);
    // tmux would need passthrough wrapping; its bell alert is enough.
    if env("TMUX").is_some() {
        return Some(BELL.to_owned());
    }
    let term = env("TERM").unwrap_or_default();
    let program = env("TERM_PROGRAM").unwrap_or_default();
    if term == "xterm-kitty" || env("KITTY_WINDOW_ID").is_some() {
        // OSC 99, shown only while the kitty window is unfocused.
        return Some(format!("\x1b]99;o=unfocused;{message}\x1b\\"));
    }
    if matches!(program.as_str(), "iTerm.app" | "WezTerm") {
        return Some(format!("\x1b]9;{message}\x07"));
    }
    if program == "ghostty" || term.starts_with("foot") || term.starts_with("rxvt") {
        return Some(format!("\x1b]777;notify;Crumb;{message}\x07"));
    }
    Some(BELL.to_owned())
}

const BELL: &str = "\x07";

/// Keeps the message printable so it cannot end or extend the sequence.
fn sanitize(message: &str) -> String {
    message
        .chars()
        .filter(|character| !character.is_control() && *character != ';')
        .take(120)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seq(vars: &[(&str, &str)], message: &str) -> Option<String> {
        let vars = vars
            .iter()
            .map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
            .collect::<Vec<_>>();
        sequence(
            &|name| {
                vars.iter()
                    .find(|(key, _)| key == name)
                    .map(|(_, value)| value.clone())
            },
            message,
        )
    }

    #[test]
    fn kitty_uses_osc_99_only_when_unfocused() {
        assert_eq!(
            seq(&[("TERM", "xterm-kitty")], "done").as_deref(),
            Some("\x1b]99;o=unfocused;done\x1b\\")
        );
    }

    #[test]
    fn iterm_and_wezterm_use_osc_9() {
        for program in ["iTerm.app", "WezTerm"] {
            assert_eq!(
                seq(&[("TERM_PROGRAM", program)], "done").as_deref(),
                Some("\x1b]9;done\x07")
            );
        }
    }

    #[test]
    fn ghostty_and_foot_use_osc_777() {
        let expected = Some("\x1b]777;notify;Crumb;done\x07".to_owned());
        assert_eq!(seq(&[("TERM_PROGRAM", "ghostty")], "done"), expected);
        assert_eq!(seq(&[("TERM", "foot")], "done"), expected);
    }

    #[test]
    fn unknown_terminals_and_tmux_get_the_bell() {
        assert_eq!(
            seq(&[("TERM", "xterm-256color")], "done").as_deref(),
            Some(BELL)
        );
        assert_eq!(
            seq(&[("TERM", "xterm-kitty"), ("TMUX", "/tmp/tmux")], "done").as_deref(),
            Some(BELL)
        );
    }

    #[test]
    fn desktop_notifications_need_a_graphical_session_bus() {
        let only = |vars: &'static [&'static str]| move |name: &str| vars.contains(&name);
        let expected = cfg!(target_os = "linux");
        assert_eq!(
            desktop_session(&only(&["WAYLAND_DISPLAY", "DBUS_SESSION_BUS_ADDRESS"])),
            expected
        );
        assert_eq!(
            desktop_session(&only(&["DISPLAY", "DBUS_SESSION_BUS_ADDRESS"])),
            expected
        );
        assert!(!desktop_session(&only(&["DISPLAY"])), "no session bus");
        assert!(
            !desktop_session(&only(&["DBUS_SESSION_BUS_ADDRESS"])),
            "no display"
        );
    }

    #[test]
    fn can_be_disabled() {
        for value in ["off", "0", "false", "No"] {
            assert_eq!(seq(&[("CRUMB_NOTIFICATIONS", value)], "done"), None);
        }
        assert!(seq(&[("CRUMB_NOTIFICATIONS", "on")], "done").is_some());
    }

    #[test]
    fn messages_cannot_break_out_of_the_sequence() {
        let sequence = seq(&[("TERM_PROGRAM", "iTerm.app")], "a\x07b\x1b]c;d").expect("enabled");
        assert_eq!(sequence, "\x1b]9;ab]cd\x07");
    }
}
