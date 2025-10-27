"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Copy,
  Check,
  Download,
  Eye,
  EyeOff,
  MoreHorizontal,
  Play,
  FileText,
  Maximize2,
  Minimize2,
  ImportIcon as Insert,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { vscDarkPlus, vs } from "react-syntax-highlighter/dist/esm/styles/prism"
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface EnhancedCodeBlockProps {
  children: string
  className?: string
  inline?: boolean
  onInsert?: (code: string) => void
  onRun?: (code: string, language: string) => void
  showLineNumbers?: boolean
  theme?: "dark" | "light"
  maxHeight?: number
  fileName?: string
}

export const EnhancedCodeBlock: React.FC<EnhancedCodeBlockProps> = ({
  children,
  className,
  inline,
  onInsert,
  onRun,
  showLineNumbers = true,
  theme = "dark",
  maxHeight = 400,
  fileName,
}) => {
  const [copied, setCopied] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [showNumbers, setShowNumbers] = useState(showLineNumbers)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  const match = /language-(\w+)/.exec(className || "")
  const language = match ? match[1] : "text"

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(children)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy code: ", err)
    }
  }

  const downloadCode = () => {
    const blob = new Blob([children], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = fileName || `code.${getFileExtension(language)}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const getFileExtension = (lang: string): string => {
    const extensions: { [key: string]: string } = {
      javascript: "js",
      typescript: "ts",
      jsx: "jsx",
      tsx: "tsx",
      python: "py",
      java: "java",
      cpp: "cpp",
      c: "c",
      csharp: "cs",
      php: "php",
      ruby: "rb",
      go: "go",
      rust: "rs",
      html: "html",
      css: "css",
      scss: "scss",
      json: "json",
      yaml: "yml",
      xml: "xml",
      sql: "sql",
      bash: "sh",
      shell: "sh",
      powershell: "ps1",
      dockerfile: "dockerfile",
      markdown: "md",
    }
    return extensions[lang.toLowerCase()] || "txt"
  }

  const getLanguageDisplayName = (lang: string): string => {
    const languageMap: { [key: string]: string } = {
      js: "JavaScript",
      javascript: "JavaScript",
      ts: "TypeScript",
      typescript: "TypeScript",
      jsx: "React JSX",
      tsx: "React TSX",
      html: "HTML",
      css: "CSS",
      scss: "SCSS",
      sass: "Sass",
      json: "JSON",
      python: "Python",
      py: "Python",
      java: "Java",
      cpp: "C++",
      c: "C",
      csharp: "C#",
      php: "PHP",
      ruby: "Ruby",
      go: "Go",
      rust: "Rust",
      sql: "SQL",
      bash: "Bash",
      sh: "Shell",
      powershell: "PowerShell",
      dockerfile: "Dockerfile",
      yaml: "YAML",
      yml: "YAML",
      xml: "XML",
      markdown: "Markdown",
      md: "Markdown",
      plaintext: "Plain Text",
      text: "Plain Text",
    }
    return languageMap[lang.toLowerCase()] || lang.charAt(0).toUpperCase() + lang.slice(1)
  }

  const isExecutable = (lang: string): boolean => {
    return ["javascript", "python", "bash", "shell", "sql"].includes(lang.toLowerCase())
  }

  const handleFeedback = (type: "up" | "down") => {
    setFeedback(type)
    // Here you could send feedback to your analytics service
    console.log(`Code block feedback: ${type}`)
  }

  if (inline) {
    return (
      <code className="bg-zinc-800/60 text-zinc-200 px-1.5 py-0.5 rounded text-sm font-mono border border-zinc-700/50">
        {children}
      </code>
    )
  }

  const lineCount = children.split("\n").length
  const shouldShowControls = lineCount > 3

  // Custom code formatter to avoid hydration errors
  const CustomCodeFormatter = () => (
    <div className="border-x border-b border-zinc-700/50 rounded-b-lg overflow-hidden bg-[#1e1e1e] relative">
      {isClient ? (
        <SyntaxHighlighter
          language={language}
          style={theme === "dark" ? vscDarkPlus : vs}
          showLineNumbers={showNumbers && lineCount > 1}
          wrapLines={true}
          wrapLongLines={true}
          customStyle={{
            margin: 0,
            padding: "16px",
            background: "transparent",
            fontSize: "13px",
            fontFamily:
              "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace",
            maxHeight: isFullscreen ? "calc(100vh - 120px)" : collapsed ? "200px" : `${maxHeight}px`,
            overflow: "auto",
          }}
          lineNumberStyle={{
            color: "#6b7280",
            fontSize: "12px",
            paddingRight: "16px",
            userSelect: "none",
          }}
        >
          {children}
        </SyntaxHighlighter>
      ) : (
        // Server-side fallback
        <pre
          className="p-4 overflow-x-auto text-sm font-mono"
          style={{
            margin: 0,
            background: "transparent",
            fontSize: "13px",
            fontFamily:
              "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace",
            maxHeight: isFullscreen ? "calc(100vh - 120px)" : collapsed ? "200px" : `${maxHeight}px`,
            overflow: "auto",
            color: theme === "dark" ? "#d4d4d4" : "#1f2937",
          }}
        >
          <code>{children}</code>
        </pre>
      )}

      {collapsed && lineCount > 20 && (
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#1e1e1e] to-transparent flex items-end justify-center pb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(false)}
            className="text-xs text-zinc-400 hover:text-zinc-200"
          >
            Show {lineCount - 10} more lines
          </Button>
        </div>
      )}
    </div>
  )

  return (
    <TooltipProvider>
      <div className={cn("relative group my-4", isFullscreen && "fixed inset-4 z-50 bg-zinc-950 rounded-lg")}>
        {/* Header with enhanced controls */}
        <div className="flex items-center justify-between bg-zinc-800/90 backdrop-blur-sm px-4 py-2.5 rounded-t-lg border border-zinc-700/50">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-zinc-400" />
              <span className="text-xs text-zinc-300 font-medium tracking-wide">
                {getLanguageDisplayName(language)}
              </span>
            </div>
            {lineCount > 1 && (
              <Badge variant="outline" className="text-xs">
                {lineCount} lines
              </Badge>
            )}
            {fileName && (
              <Badge variant="secondary" className="text-xs">
                {fileName}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Feedback buttons */}
            <div className="flex items-center gap-1 mr-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-7 w-7 p-0 transition-colors",
                      feedback === "up"
                        ? "text-green-400 hover:text-green-300"
                        : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50",
                    )}
                    onClick={() => handleFeedback("up")}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Helpful code</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-7 w-7 p-0 transition-colors",
                      feedback === "down"
                        ? "text-red-400 hover:text-red-300"
                        : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50",
                    )}
                    onClick={() => handleFeedback("down")}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Not helpful</TooltipContent>
              </Tooltip>
            </div>

            {shouldShowControls && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 transition-colors"
                      onClick={() => setShowNumbers(!showNumbers)}
                    >
                      {showNumbers ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{showNumbers ? "Hide line numbers" : "Show line numbers"}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 transition-colors"
                      onClick={() => setIsFullscreen(!isFullscreen)}
                    >
                      {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isFullscreen ? "Exit fullscreen" : "Fullscreen"}</TooltipContent>
                </Tooltip>

                {lineCount > 20 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 transition-colors"
                        onClick={() => setCollapsed(!collapsed)}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{collapsed ? "Expand code" : "Collapse code"}</TooltipContent>
                  </Tooltip>
                )}
              </>
            )}

            {/* Action buttons */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 transition-colors"
                  onClick={downloadCode}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download code</TooltipContent>
            </Tooltip>

            {onInsert && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-colors"
                    onClick={() => onInsert(children)}
                  >
                    <Insert className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Insert into editor</TooltipContent>
              </Tooltip>
            )}

            {isExecutable(language) && onRun && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-green-400 hover:text-green-300 hover:bg-green-500/10 transition-colors"
                    onClick={() => onRun(children, language)}
                  >
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Run code</TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 transition-colors"
                  onClick={copyToClipboard}
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy code</TooltipContent>
            </Tooltip>

            {/* More options dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 transition-colors"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setCollapsed(!collapsed)}>
                  {collapsed ? "Expand" : "Collapse"} Code
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowNumbers(!showNumbers)}>
                  {showNumbers ? "Hide" : "Show"} Line Numbers
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={downloadCode}>Download as File</DropdownMenuItem>
                {onInsert && <DropdownMenuItem onClick={() => onInsert(children)}>Insert into Editor</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Use custom code formatter */}
        <CustomCodeFormatter />
      </div>
    </TooltipProvider>
  )
}