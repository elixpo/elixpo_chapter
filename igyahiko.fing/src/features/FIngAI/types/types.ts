export interface AISuggestionState {
     suggestion: string | null;
     isLoading: boolean;
     position: {
         line: number;
         column: number;
     } | null;
     decoration: string[];
     isEnabled: boolean;

}
export interface UseAISuggestionsReturn extends AISuggestionState {
     toggleEnabled: () => void;
     fetchSuggestion: (type: string, editor: any) => Promise<void>;
     acceptSuggestion: (editor: any, monaco: any) => void;
     rejectSuggestion: (editor: any) => void;
     clearSuggestion: (editor: any) => void;

}

// AI chat related types;

export interface AIAgentChatProps {
     isOpen: boolean;
     onClose: () => void;
     onInsertCode?: (code: string, fileName?: string, position?: {line:number, column: number}) => void;
     onRunCode?: (code: string, language: string) => void;
     activeFileName?: string;
     activeFileContent?: string;
     activeFileLanguage?: string;
     cursorPosition?: {line: number, column: number};
     theme?: "dark" | "light"

}

export interface FileAttachment {
     id: string;
     name: string;
     content: string;
     language: string;
     size: number;
     type: "code";
     preview?: string;
     mimeType?: string;
}

export interface CodeSuggestion {
     id: string;
     title: string;
     description: string;
     code: string;
     language: string;
     insertPosition?: { line: number, column: number } | undefined
     fileName?: string;
     confidence: number;
     category?: "optimization" | "bug_fix" | "feature" | "refactor" | "security"

}

export interface ChatMessage {
     role: "user" | "assistant";
     content: string;
     id: string;
     timeStamp: Date;
     attachment: FileAttachment[];
     codeSuggestion: CodeSuggestion[];
     type?: "chat" | "code_review" | "overview" | "optimization" | "error_fix" | "suggestion";
     tokens?: number;
     models?: string;


}