'use client';

import { LLM_TEXT } from '../llm_text';
import CopyButton from './CopyButton';

/** Copies the plain-text API reference for pasting into an LLM. */
export default function CopyLlmButton() {
  return (
    <CopyButton
      text={LLM_TEXT}
      variant="tool"
      label="Copy docs for LLM"
      copiedLabel="Copied to clipboard"
      srLabel="Copy docs for LLM as plain text"
    />
  );
}
