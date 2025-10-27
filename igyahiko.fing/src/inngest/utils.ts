import {Sandbox} from "@e2b/code-interpreter";
import { AgentResult, TextMessage } from "@inngest/agent-kit";
import { SANDBOX_SET_TIMEOUT } from "./types";

export async function getSandbox(sandboxId:string) {
     const sandbox = await Sandbox.connect(sandboxId);
     await sandbox.setTimeout(SANDBOX_SET_TIMEOUT)
     return sandbox;
}


export function lastAssisTextMsgCon(result: AgentResult): string | undefined {
  const lastIndex = result.output.findLastIndex(
    (message) => message.role === 'assistant'
  );

  const message = result.output[lastIndex] as TextMessage | undefined;

  if (!message?.content) return undefined;

  if (typeof message.content === 'string') {
    return message.content;
  }

  // If content is an array (Structured content type)
  return message.content.map((chunk) => chunk.text).join("");
}
