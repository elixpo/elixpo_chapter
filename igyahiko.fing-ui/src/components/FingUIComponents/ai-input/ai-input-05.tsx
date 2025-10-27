"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Mic, Send, Terminal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAutoResizeTextarea } from "@/hooks/use-auto-resizer-textarea"
import { AIInputFiveProps } from "./types/types"


export const AIInputFive = ({
  onSubmit,
  placeholder = "Enter your command...",
  title = "AI Terminal",
  version = "v2.1.0",
}: AIInputFiveProps) => {
  const [input, setInput] = useState("")
  const [isRecording, setIsRecording] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [showCursor, setShowCursor] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useAutoResizeTextarea({ minHeight: 52, maxHeight: 200 })

  // Blinking cursor effect
  useEffect(() => {
    const interval = setInterval(() => setShowCursor((prev) => !prev), 530)
    return () => clearInterval(interval)
  }, [])

  const handleSend = async () => {
    if (!input.trim()) return
    setIsSending(true)
    await new Promise((resolve) => setTimeout(resolve, 500)) // simulate delay
    onSubmit(input.trim()) // 🔥 send prompt back to parent
    setInput("")
    setIsSending(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <motion.div
      className="w-full max-w-4xl mx-auto"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="bg-black border border-green-500/30 rounded-lg overflow-hidden font-mono">
        {/* Terminal Header */}
        <div className="bg-gray-900 px-4 py-2 border-b border-green-500/30 flex items-center gap-2">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          <Terminal className="w-4 h-4 text-green-400 ml-2" />
          <span className="text-green-400 text-sm">
            {title} {version}
          </span>
        </div>

        {/* Terminal Body */}
        <div className="p-4 bg-black">
          <div className="text-green-400 text-sm mb-2">
            <span className="text-green-300">user@ai-terminal</span>
            <span className="text-white">:</span>
            <span className="text-blue-400">~</span>
            <span className="text-white">$ </span>
            <span className="text-yellow-400">ai-chat --interactive</span>
          </div>

          <div className="text-green-400 text-sm mb-4">
            AI Chat Interface initialized. Type your message below:
          </div>

          <div className="flex items-start gap-2">
            <span className="text-green-300 text-sm mt-2 shrink-0">&gt;</span>
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className="w-full bg-transparent text-green-400 placeholder-green-600 resize-none outline-none font-mono text-sm leading-relaxed"
                rows={1}
              />
              {input === "" && showCursor && (
                <motion.div
                  className="absolute top-0 left-0 w-2 h-5 bg-green-400"
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.53, repeat: Number.POSITIVE_INFINITY }}
                />
              )}
            </div>

            <div className="flex gap-1 mt-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsRecording(!isRecording)}
                className="h-8 w-8 p-0 hover:bg-green-500/20 text-green-400 hover:text-green-300"
              >
                <motion.div
                  animate={isRecording ? { scale: [1, 1.2, 1] } : {}}
                  transition={{
                    duration: 0.5,
                    repeat: isRecording ? Number.POSITIVE_INFINITY : 0,
                  }}
                >
                  <Mic className="h-4 w-4" />
                </motion.div>
              </Button>

              <Button
                size="sm"
                onClick={handleSend}
                disabled={!input.trim() || isSending}
                className="h-8 w-8 p-0 bg-green-600 hover:bg-green-500 text-black"
              >
                <AnimatePresence mode="wait">
                  {isSending ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"
                    />
                  ) : (
                    <motion.div
                      key="send"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <Send className="h-4 w-4" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
