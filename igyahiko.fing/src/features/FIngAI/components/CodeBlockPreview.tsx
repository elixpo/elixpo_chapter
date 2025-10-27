"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Eye,
  Copy,
  Download,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  FileText,
  ImageIcon,
  Video,
  Music,
  Archive,
  Code2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { EnhancedCodeBlock } from "./AICodeBlocks"

interface FileAttachment {
  id: string
  name: string
  content: string
  language: string
  size: number
  type: "code" | "text" | "image" | "video" | "audio" | "archive"
  preview?: string
  mimeType?: string
}

interface EnhancedFilePreviewProps {
  file: FileAttachment
  onRemove: () => void
  compact?: boolean
  onExpand?: () => void
  onInsert?: (code: string) => void
  searchable?: boolean
}

export const EnhancedFilePreview: React.FC<EnhancedFilePreviewProps> = ({
  file,
  onRemove,
  compact = false,
  onExpand,
  onInsert,
  searchable = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [showSearch, setShowSearch] = useState(false)

  const getFileIcon = (type: string, name: string) => {
    const ext = name.split(".").pop()?.toLowerCase()

    if (type === "image" || ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext || "")) {
      return <ImageIcon className="h-4 w-4 text-blue-400" />
    }
    if (type === "video" || ["mp4", "avi", "mov", "wmv", "flv"].includes(ext || "")) {
      return <Video className="h-4 w-4 text-purple-400" />
    }
    if (type === "audio" || ["mp3", "wav", "flac", "aac"].includes(ext || "")) {
      return <Music className="h-4 w-4 text-green-400" />
    }
    if (type === "archive" || ["zip", "rar", "7z", "tar", "gz"].includes(ext || "")) {
      return <Archive className="h-4 w-4 text-orange-400" />
    }
    if (type === "code" || ["js", "ts", "jsx", "tsx", "py", "java", "cpp"].includes(ext || "")) {
      return <Code2 className="h-4 w-4 text-emerald-400" />
    }
    return <FileText className="h-4 w-4 text-zinc-400" />
  }

  const getFileTypeColor = (type: string) => {
    switch (type) {
      case "code":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      case "image":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20"
      case "video":
        return "bg-purple-500/10 text-purple-400 border-purple-500/20"
      case "audio":
        return "bg-green-500/10 text-green-400 border-green-500/20"
      case "archive":
        return "bg-orange-500/10 text-orange-400 border-orange-500/20"
      default:
        return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(file.content)
    } catch (err) {
      console.error("Failed to copy file content:", err)
    }
  }

  const downloadFile = () => {
    const blob = new Blob([file.content], { type: file.mimeType || "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /* const highlightSearchTerm = (text: string, term: string): string => {
    if (!term) return text
    const regex = new RegExp(`(${term})`, "gi")
    return text.replace(regex, "**$1**")
  } */

  const filteredContent = searchTerm
    ? file.content
        .split("\n")
        .filter((line) => line.toLowerCase().includes(searchTerm.toLowerCase()))
        .join("\n")
    : file.content

  if (compact) {
    return (
      <div className="flex items-center gap-2 bg-zinc-800/50 rounded-lg p-2 border border-zinc-700/50 group hover:bg-zinc-800/70 transition-colors">
        {getFileIcon(file.type, file.name)}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-zinc-200 truncate">{file.name}</div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Badge variant="outline" className={cn("text-xs", getFileTypeColor(file.type))}>
              {file.language}
            </Badge>
            <span>{formatFileSize(file.size)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onExpand}
                  className="h-6 w-6 p-0 text-zinc-400 hover:text-zinc-200"
                >
                  <Eye className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View file</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyToClipboard}
                  className="h-6 w-6 p-0 text-zinc-400 hover:text-zinc-200"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy content</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button variant="ghost" size="sm" onClick={onRemove} className="h-6 w-6 p-0 text-zinc-400 hover:text-red-400">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="border border-zinc-700/50 rounded-lg overflow-hidden bg-zinc-900/50">
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-3 bg-zinc-800/50 hover:bg-zinc-800/70 cursor-pointer transition-colors">
            <div className="flex items-center gap-3">
              {getFileIcon(file.type, file.name)}
              <div>
                <div className="text-sm font-medium text-zinc-200">{file.name}</div>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Badge variant="outline" className={cn("text-xs", getFileTypeColor(file.type))}>
                    {file.language}
                  </Badge>
                  <span>{formatFileSize(file.size)}</span>
                  {file.content.split("\n").length > 1 && <span>{file.content.split("\n").length} lines</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {isExpanded && searchable && file.type === "code" && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowSearch(!showSearch)
                        }}
                        className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200"
                      >
                        <Search className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Search in file</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-zinc-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-zinc-400" />
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove()
                }}
                className="h-7 w-7 p-0 text-zinc-400 hover:text-red-400"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          {showSearch && (
            <div className="p-3 border-b border-zinc-700/50 bg-zinc-800/30">
              <Input
                placeholder="Search in file..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 bg-zinc-900/50 border-zinc-700/50"
              />
            </div>
          )}

          <div className="border-t border-zinc-700/50">
            {file.type === "code" ? (
              <EnhancedCodeBlock
                className={`language-${file.language}`}
                onInsert={onInsert}
                fileName={file.name}
                showLineNumbers={true}
              >
                {filteredContent}
              </EnhancedCodeBlock>
            ) : file.type === "image" ? (
              <div className="p-4 text-center">
                <div className="text-sm text-zinc-400 mb-2">Image Preview</div>
                <div className="bg-zinc-800 rounded p-4">
                  <ImageIcon className="h-16 w-16 text-zinc-500 mx-auto" />
                  <p className="text-xs text-zinc-500 mt-2">Image preview not available</p>
                </div>
              </div>
            ) : (
              <div className="p-4">
                <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-mono bg-zinc-900/50 p-3 rounded border border-zinc-700/50 max-h-60 overflow-auto">
                  {filteredContent}
                </pre>
              </div>
            )}
          </div>

          {/* File actions */}
          <div className="p-3 border-t border-zinc-700/50 bg-zinc-800/30 flex items-center justify-between">
            <div className="text-xs text-zinc-500">
              {searchTerm && `Found ${filteredContent.split("\n").length} matching lines`}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={copyToClipboard} className="h-7 px-2 text-xs">
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
              <Button variant="ghost" size="sm" onClick={downloadFile} className="h-7 px-2 text-xs">
                <Download className="h-3 w-3 mr-1" />
                Download
              </Button>
              {file.type === "code" && onInsert && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onInsert(file.content)}
                  className="h-7 px-2 text-xs text-blue-400 hover:text-blue-300"
                >
                  Insert
                </Button>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}