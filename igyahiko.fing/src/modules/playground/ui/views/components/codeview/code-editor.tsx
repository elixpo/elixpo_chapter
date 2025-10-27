'use client'
import React, { useRef, useEffect, useCallback } from 'react'
import { PlaygroundCodeEditorProps } from '../../types/types'
import Editor, { type Monaco } from "@monaco-editor/react"
import { configureMonaco, defaultEditorOptions, getEditorLanguage } from '../../../../../../features/playground/lib/editor-configs'

const PlayGroundCodeEditor: React.FC<PlaygroundCodeEditorProps> = ({
    activeFile,
    content,
    onContentChange,
    onAcceptSuggestion,
    onRejectSuggestion,
    onTriggerSuggestion,
    suggestion,
    suggestionLoading,
    suggestionPosition
}) => {
    const editorRef = useRef<any>(null);
    const monacoRef = useRef<Monaco | null>(null);
   // const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;


    const inlineCompletionProviderRef = useRef<any>(null)
    const currentSuggestionRef = useRef<{
        text: string
        position: { line: number; column: number }
        id: string
    } | null>(null)
    const isAcceptingSuggestionRef = useRef(false)
    const suggestionAcceptedRef = useRef(false)
    const suggestionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const tabCommandRef = useRef<any>(null)

    // Generate unique ID for each suggestion
    const generateSuggestionId = () => `suggestion-${Date.now()}-${Math.random()}`

    const createInlineCompletiveProvider = useCallback((monaco: Monaco) => {
        return {
            provideInlineCompletions: async (position: any) => {
                if (isAcceptingSuggestionRef.current || suggestionAcceptedRef.current) {
                    console.log("Skipping completion - already accepting or accepted");
                    return { items: [] }
                }
                if (!suggestion || !suggestionPosition) {
                    return { items: [] }
                }

                const currLine = position.lineNumber;
                const currColumn = position.column;

                const isPositionMatch =
                    currLine === suggestionPosition.line &&
                    currColumn >= suggestionPosition.column &&
                    currColumn <= suggestionPosition.column + 2

                if (!isPositionMatch) {
                    console.log("Position mismatch", {
                        current: `${currLine}:${currColumn}`,
                        expected: `${suggestionPosition.line}:${suggestionPosition.column}`
                    })
                    return { items: [] }
                }
                const suggestionID = generateSuggestionId();
                currentSuggestionRef.current = {
                    text: suggestion,
                    position: suggestionPosition,
                    id: suggestionID,
                }

                const cleanSuggestion = suggestion.replace(/\r/g, "");

                return {
                    items: [
                        {
                            insertText: cleanSuggestion,
                            range: new monaco.Range(
                                suggestionPosition.line,
                                suggestionPosition.column,
                                suggestionPosition.line,
                                suggestionPosition.column,
                            ),
                            kind: monaco.languages.CompletionItemKind.Snippet,
                            label: "AI Suggestion",
                            detail: "AI-generated code suggestion",
                            documentation: "Press Tab to accept",
                            sortText: "0000", // High priority
                            filterText: "",
                            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        },
                    ],
                }
            },
            freeInlineCompletions: (completions: any) => {
                console.log("freeInlineCompletions called")
            },
        }
    }, [suggestion, suggestionPosition])

    const clearCurrentSuggestion = useCallback(() => {
        console.log("Clearing current suggestion")
        currentSuggestionRef.current = null
        suggestionAcceptedRef.current = false
        if (editorRef.current) {
            editorRef.current.trigger("ai", "editor.action.inlineSuggest.hide", null)
        }
    }, []);

const acceptCurrentSuggestion = useCallback(() => {
  if (!editorRef.current || !monacoRef.current) return false;

  const editor = editorRef.current;
  const monaco = monacoRef.current;

  // Prefer ref, fallback to props
  const activeSuggestion =
    currentSuggestionRef.current && currentSuggestionRef.current.text
      ? currentSuggestionRef.current
      : suggestion && suggestionPosition
      ? { text: suggestion, position: suggestionPosition, id: "fallback" }
      : null;

  if (!activeSuggestion) {
    console.warn("No active suggestion to accept");
    return false;
  }

  try {
    isAcceptingSuggestionRef.current = true;
    const cleanSuggestionText = activeSuggestion.text.replace(/\r/g, "");

    editor.pushUndoStop();
    editor.executeEdits("ai-suggestion-accept", [
      {
        range: new monaco.Range(
          activeSuggestion.position.line,
          activeSuggestion.position.column,
          activeSuggestion.position.line,
          activeSuggestion.position.column
        ),
        text: cleanSuggestionText,
        forceMoveMarkers: true,
      },
    ]);
    editor.pushUndoStop();

    // Move cursor
    const lines = cleanSuggestionText.split("\n");
    const endLine = activeSuggestion.position.line + lines.length - 1;
    const endColumn =
      lines.length === 1
        ? activeSuggestion.position.column + cleanSuggestionText.length
        : lines[lines.length - 1].length + 1;

    editor.setPosition({ lineNumber: endLine, column: endColumn });
    editor.focus();

    // Call parent handler
    onAcceptSuggestion(editor, monaco);

    // Clear + dispose provider
    clearCurrentSuggestion();
    if (inlineCompletionProviderRef.current) {
      inlineCompletionProviderRef.current.dispose();
      inlineCompletionProviderRef.current = null;
    }

    return true;
  } catch (error) {
    console.error("Error accepting suggestion:", error);
    return false;
  } finally {
    setTimeout(() => {
      isAcceptingSuggestionRef.current = false;
      suggestionAcceptedRef.current = false;
    }, 200);
  }
}, [onAcceptSuggestion, suggestion, suggestionPosition, clearCurrentSuggestion]);



    const hasActiveSuggestionAtPosition = useCallback(() => {
        if (!editorRef.current || !currentSuggestionRef.current) return false

        const position = editorRef.current.getPosition()
        const suggestion = currentSuggestionRef.current

        return (
            position.lineNumber === suggestion.position.line &&
            position.column >= suggestion.position.column &&
            position.column <= suggestion.position.column + 2
        )
    }, [])

    useEffect(() => {
        if (!editorRef.current || !monacoRef.current) return;
        const editor = editorRef.current;
        const monaco = monacoRef.current;

        console.log("Suggestion changed", {
            hasSuggestion: !!suggestion,
            hasPosition: !!suggestionPosition,
            isAccepting: isAcceptingSuggestionRef.current,
            suggestionAccepted: suggestionAcceptedRef.current,
        })

        // Don't update if we're in the middle of accepting a suggestion
        if (isAcceptingSuggestionRef.current || suggestionAcceptedRef.current) {
            console.log("Skipping update - currently accepting/accepted suggestion")
            return
        }
        if (inlineCompletionProviderRef.current) {
            inlineCompletionProviderRef.current.dispose()
            inlineCompletionProviderRef.current = null
        }

        // Clear current suggestion reference
        currentSuggestionRef.current = null;

        if (suggestion && suggestionPosition) {
            console.log("Registering new inline completion provider")

            const language = getEditorLanguage(activeFile?.fileExtension || "")
            const provider = createInlineCompletiveProvider(monaco)

            inlineCompletionProviderRef.current = monaco.languages.registerInlineCompletionsProvider(language, provider)

            // Small delay to ensure editor is ready, then trigger suggestions
            setTimeout(() => {
                if (editorRef.current && !isAcceptingSuggestionRef.current && !suggestionAcceptedRef.current) {
                    console.log("Triggering inline suggestions")
                    editor.trigger("ai", "editor.action.inlineSuggest.trigger", null)
                }
            }, 50)
        }

        return () => {
            if (inlineCompletionProviderRef.current) {
                inlineCompletionProviderRef.current.dispose()
                inlineCompletionProviderRef.current = null
            }
        }
    }, [suggestion, suggestionPosition, activeFile, createInlineCompletiveProvider])

    const handleEditorDidMount = (editor: any, monaco: Monaco) => {
        editorRef.current = editor
        monacoRef.current = monaco
        console.log("Editor instance mounted:", !!editorRef.current)

        editor.updateOptions({
            ...defaultEditorOptions,
            // Enable inline suggestions but with specific settings to prevent conflicts
            inlineSuggest: {
                enabled: true,
                mode: "prefix",
                suppressSuggestions: false,
            },
            // Disable some conflicting suggest features
            suggest: {
                preview: false, // Disable preview to avoid conflicts
                showInlineDetails: false,
                insertMode: "replace",
            },
            // Quick suggestions
            quickSuggestions: {
                other: true,
                comments: false,
                strings: false,
            },
            // Smooth cursor
            cursorSmoothCaretAnimation: "on",
        })

        configureMonaco(monaco)

        // Keyboard shortcuts
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
            console.log("Ctrl+Space pressed, triggering suggestion")
            onTriggerSuggestion("completion", editor)
        })

        

        // CRITICAL: Override Tab key with high priority and prevent default Monaco behavior
        if (tabCommandRef.current) {
            tabCommandRef.current.dispose()
        }

        tabCommandRef.current = editor.addCommand(
            monaco.KeyCode.Tab,
            () => {
                console.log("TAB PRESSED", {
                    hasSuggestion: !!currentSuggestionRef.current,
                    isAccepting: isAcceptingSuggestionRef.current,
                    suggestionAccepted: suggestionAcceptedRef.current,
                })

                if (isAcceptingSuggestionRef.current || suggestionAcceptedRef.current) {
                    console.log("BLOCKED: Already processing suggestion, using default tab")
                    editor.trigger("keyboard", "tab", null)
                    return
                }

                // Use the current suggestion ref instead of props
                if (currentSuggestionRef.current) {
                    const currentPosition = editor.getPosition();
                    const isAtSuggestionPosition =
                        currentPosition.lineNumber === currentSuggestionRef.current.position.line &&
                        currentPosition.column >= currentSuggestionRef.current.position.column - 2 &&
                        currentPosition.column <= currentSuggestionRef.current.position.column + 2;

                    if (isAtSuggestionPosition) {
                        console.log("ATTEMPTING to accept suggestion with Tab")
                        const accepted = acceptCurrentSuggestion()
                        if (accepted) {
                            console.log("SUCCESS: Suggestion accepted via Tab")
                            return
                        }
                    }
                }

                console.log("DEFAULT: Using default tab behavior")
                editor.trigger("keyboard", "tab", null)
            },
            "editorTextFocus"
        );

        // Escape to reject
      
editor.addCommand(monaco.KeyCode.Escape, () => {
    console.log("Escape pressed")
    if (currentSuggestionRef.current) {
        onRejectSuggestion(editor)
        clearCurrentSuggestion()
    }
})


// Ctrl+Enter (Windows/Linux) OR Cmd+Enter (Mac) to accept suggestion
/* editor.addCommand(
  monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
  () => {
    console.log("⌘/Ctrl + Enter pressed")
    const success = acceptCurrentSuggestion()
    if (!success) {
      console.warn("No suggestion to accept via ⌘/Ctrl+Enter")
    }
  },
  "editorTextFocus"
) */



        // Listen for cursor position changes to hide suggestions when moving away
        editor.onDidChangeCursorPosition((e: any) => {
            if (isAcceptingSuggestionRef.current) return

            const newPosition = e.position

            // Clear existing suggestion if cursor moved away
            if (currentSuggestionRef.current && !suggestionAcceptedRef.current) {
                const suggestionPos = currentSuggestionRef.current.position

                // If cursor moved away from suggestion position, clear it
                if (
                    newPosition.lineNumber !== suggestionPos.line ||
                    newPosition.column < suggestionPos.column ||
                    newPosition.column > suggestionPos.column + 10
                ) {
                    console.log("Cursor moved away from suggestion, clearing")
                    clearCurrentSuggestion()
                    onRejectSuggestion(editor)
                }
            }

            // Trigger new suggestion if appropriate (simplified)
            if (!currentSuggestionRef.current && !suggestionLoading) {
                // Clear any existing timeout
                if (suggestionTimeoutRef.current) {
                    clearTimeout(suggestionTimeoutRef.current)
                }

                // Trigger suggestion with a delay
                //@ts-ignore
                suggestionTimeoutRef.current = setTimeout(() => {
                    onTriggerSuggestion("completion", editor)
                }, 300)
            }
        })

        // Listen for content changes to detect manual typing over suggestions
        editor.onDidChangeModelContent((e: any) => {
            if (isAcceptingSuggestionRef.current) return

            // If user types while there's a suggestion, clear it (unless it's our insertion)
            if (currentSuggestionRef.current && e.changes.length > 0 && !suggestionAcceptedRef.current) {
                const change = e.changes[0]

                // Check if this is our own suggestion insertion
                if (
                    change.text === currentSuggestionRef.current.text ||
                    change.text === currentSuggestionRef.current.text.replace(/\r/g, "")
                ) {
                    console.log("Our suggestion was inserted, not clearing")
                    return
                }

                // User typed something else, clear the suggestion
                console.log("User typed while suggestion active, clearing")
                clearCurrentSuggestion()
            }

            // Trigger context-aware suggestions on certain typing patterns
            if (e.changes.length > 0 && !suggestionAcceptedRef.current) {
                const change = e.changes[0]

                // Trigger suggestions after specific characters
                if (
                    change.text === "\n" || // New line
                    change.text === "{" || // Opening brace
                    change.text === "." || // Dot notation
                    change.text === "=" || // Assignment
                    change.text === "(" || // Function call
                    change.text === "," || // Parameter separator
                    change.text === ":" || // Object property
                    change.text === ";" // Statement end
                ) {
                    setTimeout(() => {
                        if (editorRef.current && !currentSuggestionRef.current && !suggestionLoading) {
                            onTriggerSuggestion("completion", editor)
                        }
                    }, 100) // Small delay to let the change settle
                }
            }
        })

        updateEditorLanguage()
    }

    const handleEditorChange = (value: string | undefined) => {
        // Ensure we only call onContentChange with defined strings
        if (value !== undefined) {
            onContentChange(value)
        }
    }

    const updateEditorLanguage = () => {
        if (!activeFile || !monacoRef.current || !editorRef.current) return

        const model = editorRef.current.getModel()
        if (!model) return

        const language = getEditorLanguage(activeFile.fileExtension)
        try {
            monacoRef.current.editor.setModelLanguage(model, language)
        } catch (error) {
            console.warn("Failed to set editor language:", error)
        }
    }

    // Update language when active file changes
    useEffect(() => {
        updateEditorLanguage()
    }, [activeFile?.fileExtension]);

    useEffect(() => {
        return () => {
            if (suggestionTimeoutRef.current) {
                clearTimeout(suggestionTimeoutRef.current)
            }
            if (inlineCompletionProviderRef.current) {
                inlineCompletionProviderRef.current.dispose()
                inlineCompletionProviderRef.current = null
            }
           /*  if (tabCommandRef.current) {
                tabCommandRef.current.dispose()
                tabCommandRef.current = null
            } */
        }
    }, [])
    
    // Add this useEffect for manual hotkey
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Enter' && event.ctrlKey && currentSuggestionRef.current) {
                event.preventDefault();
                if (editorRef.current && monacoRef.current) {
                    acceptCurrentSuggestion();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [acceptCurrentSuggestion]); 

    return (
        <div className="h-full relative w-full">
            {/* Debug overlay - remove in production */}
            <div className="absolute top-2 left-2 z-20 bg-gray-800 text-white px-2 py-1 rounded text-xs font-mono opacity-80">
                Suggestion: {suggestion ? `${suggestion.length} chars` : 'none'}
            </div>

            {suggestionLoading && (
                <div className="absolute font-mono top-2 right-2 z-10 bg-blue-100 dark:bg-red-900 px-2 py-1 rounded text-xs text-blue-700 dark:text-red-400 flex items-center gap-1">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    AI thinking...
                </div>
            )}

            {suggestion && !suggestionLoading && (
                <div className="absolute top-10 right-2 z-10 font-mono bg-green-100 dark:bg-green-900 px-2 py-1 rounded text-xs text-green-700 dark:text-green-300 flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    Press Ctrl+Enter to force accept 
                </div>
            )}

            {suggestion && !suggestionLoading && (
                <div className="absolute bottom-2 left-2 right-2 z-10 bg-yellow-100 dark:bg-neutral-950 border border-yellow-300 dark:border-neutral-800 p-2 rounded text-xs font-mono">
                    <div className="font-bold mb-1">AI Suggestion:</div>
                    <pre className="whitespace-pre-wrap break-words text-yellow-800 dark:text-yellow-200">
                        {suggestion}
                    </pre>
                    <div className="flex gap-2 mt-2">
                       <button
  onClick={() => {
    const success = acceptCurrentSuggestion();
    if (!success) {
      console.warn("No suggestion to accept via button");
    }
  }}
  className="px-2 py-1 bg-green-600 text-white rounded text-xs"
>
  Accept
</button>

                       <button
  onClick={() => {
    if (editorRef.current) {
      onRejectSuggestion(editorRef.current);
      clearCurrentSuggestion();
      if (inlineCompletionProviderRef.current) {
        inlineCompletionProviderRef.current.dispose();
        inlineCompletionProviderRef.current = null;
      }
    }
  }}
  className="px-2 py-1 bg-red-500 text-white rounded text-xs"
>
  Reject
</button>

                    </div>
                </div>
            )}

            <Editor
                height="100%"
                width="100%"
                theme="vs-dark"
                path={activeFile?.filename || 'untitled'}
                language={getEditorLanguage(activeFile?.fileExtension || 'plaintext')}
                value={content}
                onChange={handleEditorChange}
                onMount={handleEditorDidMount}
                //@ts-ignore
                options={{
                    ...defaultEditorOptions,
                    automaticLayout: true,
                }}
            />
        </div>
    )
}

export default PlayGroundCodeEditor