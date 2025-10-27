import { type NextRequest, NextResponse } from "next/server";

interface CodeSuggestionProps {
  fileContent: string;
  cursorLine: number;
  cursorColumn: number;
  suggestionType: string;
  fileName?: string;
}

interface CodeContext {
  language: string;
  framework: string;
  beforeContext: string;
  currentLine: string;
  afterContext: string;
  cursorPosition: { line: number; column: number };
  isInFunction: boolean;
  isInClass: boolean;
  isAfterComment: boolean;
  incompletePatterns: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body: CodeSuggestionProps = await request.json();
    const { cursorColumn, cursorLine, fileContent, suggestionType, fileName } = body;

    if (!fileContent || cursorLine < 0 || cursorColumn < 0 || !suggestionType) {
      return NextResponse.json({ error: "Invalid input parameters" }, { status: 400 });
    }

    console.log('🔍 Received AI suggestion request:', {
      cursorLine,
      cursorColumn,
      suggestionType,
      fileName,
      contentLength: fileContent.length
    });

    const context = analyzeCodeContext(fileContent, cursorLine, cursorColumn, fileName);
    const prompt = buildPrompt(context, suggestionType);
    
    console.log('📝 Generated prompt length:', prompt.length);

    const suggestion = await generateSuggestion(prompt);

    console.log('✅ Generated suggestion:', suggestion ? 'Yes' : 'No', suggestion?.length || 0, 'chars');

    return NextResponse.json({
      suggestion: suggestion || generateMockSuggestion(prompt),
      context,
      metadata: {
        language: context.language,
        framework: context.framework,
        position: context.cursorPosition,
        generatedAt: new Date().toISOString(),
      }
    });

  } catch (error) {
    console.error("❌ Context analysis error", error);
    return NextResponse.json({ 
      error: "Internal server error",
      suggestion: "// Error: Could not generate suggestion" 
    }, { status: 500 });
  }
}

const analyzeCodeContext = (
  content: string,
  line: number,
  column: number,
  fileName?: string
): CodeContext => {
  const lines = content.split("\n");
  const currentLine = lines[line] || "";

  // Get surrounding context (10 lines before and after)
  const contextRadius = 10;
  const startLine = Math.max(0, line - contextRadius);
  const endLine = Math.min(lines.length, line + contextRadius);

  const beforeContext = lines.slice(startLine, line).join("\n");
  const afterContext = lines.slice(line + 1, endLine).join("\n");

  // Detect language and framework
  const language = detectLanguage(content, fileName);
  const framework = detectFramework(content);

  // Analyze code patterns
  const isInFunction = detectInFunction(lines, line);
  const isInClass = detectInClass(lines, line);
  const isAfterComment = detectAfterComment(currentLine, column);
  const incompletePatterns = detectIncompletePatterns(currentLine, column);

  return {
    language,
    framework,
    beforeContext,
    currentLine,
    afterContext,
    cursorPosition: { line, column },
    isInFunction,
    isInClass,
    isAfterComment,
    incompletePatterns,
  };
};

function buildPrompt(context: CodeContext, suggestionType: string): string {
  return `You are an expert code completion assistant. Generate a ${suggestionType} suggestion.

Language: ${context.language}
Framework: ${context.framework}

Context:
${context.beforeContext}
${context.currentLine.substring(0, context.cursorPosition.column)}|CURSOR|${context.currentLine.substring(context.cursorPosition.column)}
${context.afterContext}

Analysis:
- In Function: ${context.isInFunction}
- In Class: ${context.isInClass}
- After Comment: ${context.isAfterComment}
- Incomplete Patterns: ${context.incompletePatterns.join(", ") || "None"}

Instructions:
1. Provide only the code that should be inserted at the cursor
2. Maintain proper indentation and style
3. Follow ${context.language} best practices
4. Make the suggestion contextually appropriate

Generate suggestion:`;
}

async function generateSuggestion(prompt: string): Promise<string> {
  try {
    const ollamaHost = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
    
    console.log('🤖 Calling Ollama at:', ollamaHost);

    // First check if Ollama is available
    try {
      const healthCheck = await fetch(`${ollamaHost}/api/tags`, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (!healthCheck.ok) {
        console.log('❌ Ollama health check failed');
        return generateMockSuggestion(prompt);
      }

      const healthData = await healthCheck.json();
      console.log(
  '✅ Ollama available, models:',
  healthData.models?.map((m: { name: string }) => m.name) || []
);

    } catch (healthError) {
      console.log('❌ Ollama not available:', healthError);
      return generateMockSuggestion(prompt);
    }

    // Generate suggestion with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`${ollamaHost}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "codellama",
        prompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_predict: 150,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Ollama API error:', response.status, errorText);
      return generateMockSuggestion(prompt);
    }

    const data = await response.json();
    console.log('📦 Ollama response received');

    // Handle different response formats
    let suggestion = data.response || data.message?.content || data.choices?.[0]?.text || '';

    if (!suggestion) {
      console.log('❌ Empty response from Ollama');
      return generateMockSuggestion(prompt);
    }

    // Clean up the suggestion
    suggestion = cleanSuggestion(suggestion);
    
    if (!suggestion.trim()) {
      console.log('❌ Empty suggestion after cleaning');
      return generateMockSuggestion(prompt);
    }

    console.log('✨ Final suggestion length:', suggestion.length);
    return suggestion;

 } catch (error: unknown) {
  if (error instanceof Error) {
    console.error("❌ Ollama generation error:", error.message);
  } else {
    console.error("❌ Ollama generation error:", error);
  }
  return generateMockSuggestion(prompt);
}
}

function cleanSuggestion(suggestion: string): string {
  // Remove code blocks
  if (suggestion.includes("```")) {
    const codeMatch = suggestion.match(/```[\w]*\n?([\s\S]*?)```/);
    if (codeMatch) {
      suggestion = codeMatch[1].trim();
    }
  }

  // Remove cursor markers
  suggestion = suggestion.replace(/\|CURSOR\|/g, "").trim();

  // Remove any explanatory text before code
  const lines = suggestion.split('\n');
  const codeLines = lines.filter(line => 
    !line.startsWith('Here') && 
    !line.startsWith('The') && 
    !line.startsWith('This') &&
    !line.match(/^[^a-zA-Z0-9]*$/)
  );

  return codeLines.join('\n').trim();
}

function generateMockSuggestion(prompt: string): string {
  console.log('🎭 Using mock suggestion');
  
  // Extract context from prompt for better mock suggestions
  const lines = prompt.split('\n');
  const currentLine = lines.find(line => line.includes('|CURSOR|')) || '';

  if (currentLine.includes('console.')) return 'log("Hello World");';
  if (currentLine.includes('function') || currentLine.includes('def ')) return '{\n  // TODO: Implement function\n}';
  if (currentLine.includes('const ') || currentLine.includes('let ')) return '= null;';
  if (currentLine.includes('import ') || currentLine.includes('from ')) return 'React from "react";';
  if (currentLine.includes('return')) return 'null;';
  if (currentLine.includes('if') || currentLine.includes('while')) return ' (condition) {\n  \n}';
  if (currentLine.includes('class ')) return ' {\n  \n}';

  // Default mock suggestions based on language
  if (prompt.includes('Language: TypeScript')) return '// TypeScript code suggestion';
  if (prompt.includes('Language: Python')) return '# Python code suggestion';
  if (prompt.includes('Language: JavaScript')) return '// JavaScript code suggestion';

  return `// AI suggestion placeholder
// Ensure Ollama is running: ollama serve
// Pull a model: ollama pull codellama`;
}

function detectLanguage(content: string, fileName?: string): string {
  if (fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase();
    const extMap: Record<string, string> = {
      ts: "TypeScript",
      tsx: "TypeScript",
      js: "JavaScript",
      jsx: "JavaScript",
      py: "Python",
      java: "Java",
      go: "Go",
      rs: "Rust",
      php: "PHP",
      css: "CSS",
      html: "HTML",
    };
    if (ext && extMap[ext]) return extMap[ext];
  }

  // Content-based detection
  if (content.includes("interface ") || content.includes(": string") || content.includes("type ")) return "TypeScript";
  if (content.includes("def ") || content.includes("import ") || content.includes("from ")) return "Python";
  if (content.includes("func ") || content.includes("package ")) return "Go";
  if (content.includes("<?php") || content.includes("$")) return "PHP";

  return "JavaScript";
}

function detectFramework(content: string): string {
  if (content.includes("import React") || content.includes("useState") || content.includes("useEffect")) return "React";
  if (content.includes("import Vue") || content.includes("<template>")) return "Vue";
  if (content.includes("@angular/") || content.includes("@Component")) return "Angular";
  if (content.includes("next/") || content.includes("getServerSideProps")) return "Next.js";
  if (content.includes("vue") || content.includes("Vue.component")) return "Vue";

  return "None";
}

function detectInFunction(lines: string[], currentLine: number): boolean {
  for (let i = currentLine - 1; i >= 0; i--) {
    const line = lines[i];
    if (line?.match(/^\s*(function|def|const\s+\w+\s*=|let\s+\w+\s*=|async\s+function)/)) return true;
    if (line?.match(/^\s*}/)) break;
  }
  return false;
}

function detectInClass(lines: string[], currentLine: number): boolean {
  for (let i = currentLine - 1; i >= 0; i--) {
    const line = lines[i];
    if (line?.match(/^\s*(class|interface|type)\s+/)) return true;
    if (line?.match(/^\s*}/)) break;
  }
  return false;
}

function detectAfterComment(line: string, column: number): boolean {
  const beforeCursor = line.substring(0, column);
  return /\/\/.*$/.test(beforeCursor) || /#.*$/.test(beforeCursor) || /\/\*.*$/.test(beforeCursor);
}

function detectIncompletePatterns(line: string, column: number): string[] {
  const beforeCursor = line.substring(0, column);
  const patterns: string[] = [];

  if (/^\s*(if|while|for|switch)\s*\($/.test(beforeCursor.trim())) patterns.push("conditional");
  if (/^\s*(function|def|const|let|var)\s*$/.test(beforeCursor.trim())) patterns.push("function");
  if (/\{\s*$/.test(beforeCursor)) patterns.push("object");
  if (/\[\s*$/.test(beforeCursor)) patterns.push("array");
  if (/=\s*$/.test(beforeCursor)) patterns.push("assignment");
  if (/\.\s*$/.test(beforeCursor)) patterns.push("method-call");
  if (/<\s*$/.test(beforeCursor)) patterns.push("jsx-element");

  return patterns;
}
// Rename unused function
function _getLastNonEmptyLine(lines: string[], currentLine: number): string {
  for (let i = currentLine - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.trim() !== "") return line;
  }
  return "";
}

// Add CORS headers if needed for development
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}