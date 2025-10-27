"use client"

import type React from "react"
import { useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Mic, Send, Cog, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAutoResizeTextarea } from "@/hooks/use-auto-resizer-textarea"
import { AIInputSixProps } from "./types/types"


export const AIInputSix = ({
  placeholder = "INPUT COMMAND SEQUENCE...",
  temperature = 98,
  pressure = 100,
  status = "READY",
  onSend,
  onRecordStart,
  onRecordStop,
}: AIInputSixProps) => {
  const [input, setInput] = useState("")
  const [isRecording, setIsRecording] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [steamActive, setSteamActive] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useAutoResizeTextarea({minHeight: 52, maxHeight: 200})

  const handleSend = async () => {
    if (!input.trim()) return
    setIsSending(true)
    setSteamActive(true)

    // Allow parent to handle send logic
    await onSend?.(input)

    // Fake delay for UI effect
    await new Promise((resolve) => setTimeout(resolve, 1200))

    setInput("")
    setIsSending(false)
    setSteamActive(false)
  }

  const toggleRecording = () => {
    if (isRecording) {
      onRecordStop?.()
    } else {
      onRecordStart?.()
    }
    setIsRecording(!isRecording)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <motion.div
      className="w-full max-w-3xl mx-auto"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      <div className="relative bg-gradient-to-br from-gray-800 via-gray-700 to-gray-900 rounded-lg shadow-2xl border-4 border-gray-600 overflow-hidden">
        {/* Steam effects */}
        <AnimatePresence>
          {steamActive &&
            [...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0, y: 0 }}
                animate={{
                  opacity: [0, 0.6, 0],
                  scale: [0, 1.5, 2],
                  y: [-20, -60, -100],
                }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 2,
                  delay: i * 0.2,
                  ease: "easeOut",
                }}
                className="absolute w-4 h-4 bg-white/20 rounded-full blur-sm"
                style={{ left: `${20 + i * 10}%`, top: "80%" }}
              />
            ))}
        </AnimatePresence>

        <div className="relative z-10 p-6">
          {/* Industrial header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
              >
                <Cog className="w-8 h-8 text-orange-400" />
              </motion.div>
              <div>
                <h3 className="text-xl font-bold text-orange-400 font-mono tracking-wider">INDUSTRIAL AI UNIT</h3>
                <div className="text-sm text-gray-400 font-mono">
                  MODEL: IA-2024 | STATUS: {status}
                </div>
              </div>
            </div>
          </div>

          {/* Input field */}
          <div className="relative mx-8">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="w-full bg-gray-900/80 text-orange-300 placeholder-orange-600/70 border-2 border-orange-500/50 px-4 py-3 pr-20 resize-none outline-none font-mono text-sm leading-relaxed focus:border-orange-400 transition-all duration-300"
              rows={1}
            />

            {/* Buttons */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={toggleRecording}
                className="h-8 w-8 p-0 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30"
              >
                <motion.div
                  animate={
                    isRecording
                      ? { scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }
                      : {}
                  }
                  transition={{ duration: 0.8, repeat: isRecording ? Number.POSITIVE_INFINITY : 0 }}
                >
                  <Mic className="h-4 w-4" />
                </motion.div>
              </Button>

              <Button
                size="sm"
                onClick={handleSend}
                disabled={!input.trim() || isSending}
                className="h-8 w-8 p-0 bg-orange-600 hover:bg-orange-500 text-gray-900 shadow-lg border border-orange-400"
              >
                <AnimatePresence mode="wait">
                  {isSending ? (
                    <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <Wrench className="h-4 w-4 animate-pulse" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="send"
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 5 }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <Send className="h-4 w-4" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Button>
            </div>
          </div>

          {/* Control panel */}
          <div className="flex justify-between items-center mt-6 px-8">
            <div className="flex gap-4">
              <div className="text-xs font-mono text-orange-400">TEMP: {temperature}°C</div>
              <div className="text-xs font-mono text-orange-400">PRESSURE: {pressure} PSI</div>
            </div>
            <div className="flex gap-2">
              <motion.div
                className={`w-3 h-3 rounded-full ${
                  status === "READY" ? "bg-green-400" : status === "ERROR" ? "bg-red-500" : "bg-yellow-400"
                }`}
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
              />
              <span className="text-xs font-mono text-green-400">{status}</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
