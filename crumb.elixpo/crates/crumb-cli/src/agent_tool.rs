//! `crumb_agent`: lets an MCP client hand a whole task to Crumb's agent.
//!
//! The call runs one non-interactive turn, exactly as `crumb exec` does, in
//! the workspace `crumb mcp serve` started in. The inner agent's tools follow
//! the same configured approvals, so delegating never widens what Crumb may
//! do. The call itself is classed as network access because it reaches the
//! model provider and spends the user's credit.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{Context, Result};
use crumb_agent::{
    AgentConfig, CancellationToken, RiskClass, ToolDescriptor, ToolHandler, ToolHost, ToolOutput,
    ToolTransport,
};
use serde_json::{Value, json};

pub(crate) const TOOL_NAME: &str = "crumb_agent";

/// Registers `crumb_agent` for `workspace` with the server's configuration.
pub(crate) fn register_crumb_agent_tool(
    host: &mut ToolHost,
    workspace: &Path,
    config: &AgentConfig,
) -> Result<()> {
    host.register(
        descriptor(),
        Arc::new(CrumbAgent {
            workspace: workspace.to_path_buf(),
            config: config.clone(),
        }),
    )
}

fn descriptor() -> ToolDescriptor {
    ToolDescriptor {
        name: TOOL_NAME.to_owned(),
        description: "Hand a complete task to Crumb's own agent, which works in this workspace \
                      with its own tools and model (Pollinations by default) and returns its \
                      final answer. Describe the whole task and the expected result; the agent \
                      cannot ask follow-up questions. Its tool use follows the user's Crumb \
                      permissions."
            .to_owned(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "minLength": 1,
                    "description": "The full task, with any context and the expected result"
                }
            },
            "required": ["task"],
            "additionalProperties": false
        }),
        risk: RiskClass::NetworkAccess,
        transport: ToolTransport::Native,
    }
}

struct CrumbAgent {
    workspace: PathBuf,
    config: AgentConfig,
}

impl ToolHandler for CrumbAgent {
    fn call(&self, arguments: &Value, cancellation: &CancellationToken) -> Result<ToolOutput> {
        let task = task_argument(arguments)?;
        let mut runtime = super::exec_runtime(&self.workspace)?;
        let result = runtime.run_local_job(task, &self.config, &self.workspace, cancellation)?;
        Ok(ToolOutput {
            text: crumb_ui::visible_agent_text(&result.final_response),
            structured: Some(json!({
                "session_id": result.session_id,
                "finish_reason": result.finish_reason,
                "usage": {
                    "input_tokens": result.input_tokens,
                    "cached_input_tokens": result.cached_input_tokens,
                    "output_tokens": result.output_tokens,
                }
            })),
            is_error: false,
        })
    }
}

fn task_argument(arguments: &Value) -> Result<&str> {
    arguments
        .get("task")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|task| !task.is_empty())
        .context("task must be a non-empty string")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn task_must_be_present_and_not_blank() {
        assert_eq!(
            task_argument(&json!({"task": "  fix the test  "})).unwrap(),
            "fix the test"
        );
        assert!(task_argument(&json!({"task": "   "})).is_err());
        assert!(task_argument(&json!({})).is_err());
        assert!(task_argument(&json!({"task": 3})).is_err());
    }

    #[test]
    fn delegation_is_gated_as_network_access() {
        let mut host = ToolHost::default();
        register_crumb_agent_tool(&mut host, Path::new("."), &AgentConfig::default()).unwrap();
        let tool = host
            .descriptor(TOOL_NAME)
            .expect("crumb_agent is registered");
        assert_eq!(tool.risk, RiskClass::NetworkAccess);
        assert_eq!(tool.input_schema["required"], json!(["task"]));
    }
}
