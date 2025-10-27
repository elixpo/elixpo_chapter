import { useState, useCallback } from "react";
import type * as monaco from "monaco-editor";

interface AISuggestionsState {
  suggestion: string | null;
  isLoading: boolean;
  position: { line: number; column: number } | null;
  decoration: string[];
  isEnabled: boolean;
}

interface UseAISuggestionsReturn extends AISuggestionsState {
  toggleEnabled: () => void;
  fetchSuggestion: (type: string, editor: monaco.editor.IStandaloneCodeEditor) => Promise<void>;
  acceptSuggestion: (
    editor: monaco.editor.IStandaloneCodeEditor,
    monacoNs: typeof monaco,
    updateFileContent?: (fileId: string, content: string) => void,
    fileId?: string
  ) => void;
  rejectSuggestion: (editor: monaco.editor.IStandaloneCodeEditor) => void;
  clearSuggestion: (editor: monaco.editor.IStandaloneCodeEditor) => void;
}

export const useAISuggestion = (): UseAISuggestionsReturn => {
  const [state, setState] = useState<AISuggestionsState>({
    suggestion: null,
    isLoading: false,
    position: null,
    decoration: [],
    isEnabled: true,
  });

  const toggleEnabled = useCallback(() => {
    setState((prev) => ({ ...prev, isEnabled: !prev.isEnabled }));
  }, []);

  const fetchSuggestion = useCallback(
    async (type: string, editor: monaco.editor.IStandaloneCodeEditor) => {
      console.log("Fetching AI suggestion...");
      console.log("AI Suggestions Enabled:", state.isEnabled);
      console.log("Editor Instance Available:", !!editor);

      setState((currentState) => {
        if (!currentState.isEnabled) {
          console.warn("AI suggestions are disabled.");
          return currentState;
        }

        if (!editor) {
          console.warn("Editor instance is not available.");
          return currentState;
        }

        const model = editor.getModel();
        const cursorPosition = editor.getPosition();

        if (!model || !cursorPosition) {
          console.warn("Editor model or cursor position is not available.");
          return currentState;
        }

        const newState = { ...currentState, isLoading: true };

        (async () => {
          try {
            const payload = {
              fileContent: model.getValue(),
              cursorLine: cursorPosition.lineNumber - 1,
              cursorColumn: cursorPosition.column - 1,
              suggestionType: type,
            };
            console.log("Request payload:", payload);

            const response = await fetch("/api/fingAI-suggestion", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

            if (!response.ok) {
              throw new Error(`API responded with status ${response.status}`);
            }

            const data: { suggestion?: string } = await response.json();
            console.log("API response:", data);

            if (data.suggestion) {
              const suggestionText = data.suggestion.trim();
              setState((prev) => ({
                ...prev,
                suggestion: suggestionText,
                position: {
                  line: cursorPosition.lineNumber,
                  column: cursorPosition.column,
                },
                isLoading: false,
              }));
            } else {
              console.warn("No suggestion received from API.");
              setState((prev) => ({ ...prev, isLoading: false }));
            }
          } catch (error) {
            console.error("Error fetching code suggestion:", error);
            setState((prev) => ({ ...prev, isLoading: false }));
          }
        })();

        return newState;
      });
    },
    [state.isEnabled] // ✅ added proper dependency
  );

  const acceptSuggestion = useCallback(
    (
      editor: monaco.editor.IStandaloneCodeEditor,
      monacoNs: typeof monaco,
      updateFileContent?: (fileId: string, content: string) => void,
      fileId?: string
    ) => {
      setState((currentState) => {
        if (!currentState.suggestion || !currentState.position || !editor || !monacoNs) {
          return currentState;
        }

        const { line, column } = currentState.position;
        const sanitizedSuggestion = currentState.suggestion.replace(/^\d+:\s*/gm, "");

        editor.executeEdits("", [
          {
            range: new monacoNs.Range(line, column, line, column),
            text: sanitizedSuggestion,
            forceMoveMarkers: true,
          },
        ]);

        if (updateFileContent && fileId) {
          setTimeout(() => {
            const newContent = editor.getModel()?.getValue() || "";
            updateFileContent(fileId, newContent);
          }, 0);
        }

        return {
          ...currentState,
          suggestion: null,
          position: null,
          decoration: [],
        };
      });
    },
    []
  );

  const rejectSuggestion = useCallback((editor: monaco.editor.IStandaloneCodeEditor) => {
    setState((currentState) => {
      if (editor && currentState.decoration.length > 0) {
        editor.deltaDecorations(currentState.decoration, []);
      }
      return {
        ...currentState,
        suggestion: null,
        position: null,
        decoration: [],
      };
    });
  }, []);

  const clearSuggestion = useCallback((editor: monaco.editor.IStandaloneCodeEditor) => {
    setState((currentState) => {
      if (editor && currentState.decoration.length > 0) {
        editor.deltaDecorations(currentState.decoration, []);
      }
      return {
        ...currentState,
        suggestion: null,
        position: null,
        decoration: [],
      };
    });
  }, []);

  return {
    ...state,
    toggleEnabled,
    fetchSuggestion,
    acceptSuggestion,
    rejectSuggestion,
    clearSuggestion,
  };
};
