//! `/terminal-setup`: makes Shift+Enter insert a new line where the terminal
//! cannot report it on its own.
//!
//! VS Code and its forks send Shift+Enter as a plain Enter. A user
//! keybinding that sends Alt+Enter (`ESC` `CR`) while a terminal has focus
//! fixes that; Crumb already treats Alt+Enter as a new line. The file is
//! JSON with comments, so the entry is inserted as text after the opening
//! bracket instead of rewriting the user's file.

use std::fmt::Write as _;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};

const ENTRY: &str = r#"  {
    "key": "shift+enter",
    "command": "workbench.action.terminal.sendSequence",
    "args": { "text": "\u001b\r" },
    "when": "terminalFocus"
  }"#;

/// VS Code family editors, by the folder that holds their user settings.
const EDITORS: [(&str, &str); 5] = [
    ("VS Code", "Code"),
    ("VS Code Insiders", "Code - Insiders"),
    ("Cursor", "Cursor"),
    ("Windsurf", "Windsurf"),
    ("VSCodium", "VSCodium"),
];

/// Runs the setup for the current terminal and reports what it did.
pub(crate) fn run(writer: &mut dyn Write) -> Result<()> {
    let terminal = std::env::var("TERM_PROGRAM").unwrap_or_default();
    if terminal != "vscode" {
        return explain_other_terminal(&terminal, writer);
    }
    let mut changed = false;
    for (name, folder) in EDITORS {
        let Some(user) = user_settings_folder(folder) else {
            continue;
        };
        if !user.is_dir() {
            continue;
        }
        let path = user.join("keybindings.json");
        match install(&path)? {
            Install::Added => {
                writeln!(
                    writer,
                    "◆ {name}: Shift+Enter now inserts a new line in the terminal"
                )?;
                writeln!(writer, "  Updated {} (backup beside it)", path.display())?;
                changed = true;
            }
            Install::AlreadyPresent => {
                writeln!(writer, "◆ {name}: Shift+Enter is already set up")?;
                changed = true;
            }
        }
    }
    if !changed {
        writeln!(
            writer,
            "◆ No VS Code settings folder was found. Add this to keybindings.json yourself:\n{ENTRY}"
        )?;
    }
    Ok(())
}

fn explain_other_terminal(terminal: &str, writer: &mut dyn Write) -> Result<()> {
    let name = if terminal.is_empty() {
        "This terminal"
    } else {
        terminal
    };
    writeln!(
        writer,
        "◆ {name} needs no setup if it supports the enhanced keyboard protocol (kitty, WezTerm, foot, iTerm2, Ghostty): Shift+Enter already inserts a new line.\n  Otherwise use Ctrl+J or Alt+Enter for a new line. Run /terminal-setup from VS Code's terminal to configure VS Code."
    )?;
    Ok(())
}

fn user_settings_folder(editor: &str) -> Option<PathBuf> {
    let base = if cfg!(target_os = "macos") {
        directories::BaseDirs::new()?
            .home_dir()
            .join("Library/Application Support")
    } else {
        directories::BaseDirs::new()?.config_dir().to_path_buf()
    };
    Some(base.join(editor).join("User"))
}

#[derive(Debug, Eq, PartialEq)]
enum Install {
    Added,
    AlreadyPresent,
}

fn install(path: &Path) -> Result<Install> {
    let current = match fs::read_to_string(path) {
        Ok(text) => Some(text),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(error).context("failed to read keybindings.json"),
    };
    let Some(updated) = with_shift_enter(current.as_deref())? else {
        return Ok(Install::AlreadyPresent);
    };
    if let Some(original) = &current {
        fs::write(path.with_extension("json.crumb-backup"), original)
            .context("failed to back up keybindings.json")?;
    }
    fs::write(path, updated).context("failed to write keybindings.json")?;
    Ok(Install::Added)
}

/// The keybindings text with the Shift+Enter entry added, or `None` when
/// an equivalent binding is already there.
fn with_shift_enter(current: Option<&str>) -> Result<Option<String>> {
    let Some(text) = current.filter(|text| !text.trim().is_empty()) else {
        return Ok(Some(format!("[\n{ENTRY}\n]\n")));
    };
    let compact = text.split_whitespace().collect::<String>();
    if compact.contains(r#""key":"shift+enter""#) && compact.contains("terminal.sendSequence") {
        return Ok(None);
    }
    let Some(open) = text.find('[') else {
        bail!("keybindings.json does not contain a list; add the entry yourself");
    };
    let rest = &text[open + 1..];
    let empty = rest.trim_start().starts_with(']');
    let mut updated = String::with_capacity(text.len() + ENTRY.len() + 4);
    updated.push_str(&text[..=open]);
    let _ = write!(updated, "\n{ENTRY}{}", if empty { "\n" } else { "," });
    updated.push_str(rest);
    Ok(Some(updated))
}

#[cfg(test)]
mod tests {
    use super::{Install, install, with_shift_enter};

    #[test]
    fn missing_or_empty_files_get_a_fresh_list() {
        let created = with_shift_enter(None).expect("valid").expect("added");
        assert!(created.starts_with("[\n  {\n    \"key\": \"shift+enter\""));
        assert!(created.trim_end().ends_with(']'));
        assert!(
            with_shift_enter(Some("[]"))
                .expect("valid")
                .expect("added")
                .contains("sendSequence")
        );
    }

    #[test]
    fn existing_bindings_and_comments_are_kept() {
        let current =
            "// my bindings\n[\n  { \"key\": \"ctrl+k\", \"command\": \"x\" }, // trailing\n]\n";
        let updated = with_shift_enter(Some(current))
            .expect("valid")
            .expect("added");
        assert!(updated.starts_with("// my bindings\n[\n  {\n    \"key\": \"shift+enter\""));
        assert!(updated.contains("},\n  { \"key\": \"ctrl+k\", \"command\": \"x\" }, // trailing"));
        assert!(
            with_shift_enter(Some(&updated)).expect("valid").is_none(),
            "second run changes nothing"
        );
    }

    #[test]
    fn install_backs_up_the_original() {
        let folder = tempfile::tempdir().expect("folder");
        let path = folder.path().join("keybindings.json");
        std::fs::write(&path, "[]").expect("seed");
        assert_eq!(install(&path).expect("install"), Install::Added);
        assert_eq!(
            std::fs::read_to_string(folder.path().join("keybindings.json.crumb-backup"))
                .expect("backup"),
            "[]"
        );
        assert_eq!(install(&path).expect("install"), Install::AlreadyPresent);
        assert!(with_shift_enter(Some("{}")).is_err());
    }
}
