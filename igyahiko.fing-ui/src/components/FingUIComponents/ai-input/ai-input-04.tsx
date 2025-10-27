"use client"

import { Textarea } from "@/components/ui/textarea"
import { useAutoResizeTextarea } from "@/hooks/use-auto-resizer-textarea"
import { cn } from "@/lib/utils"
import { Send, Mic, MessageCircle } from "lucide-react"
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AIInputVariant04Props } from "./types/types"

// ✅ Props types


export const AIInputFour: React.FC<AIInputVariant04Props> = ({
  placeholder = "Type your message here...",
  minHeight = 52,
  maxHeight = 200,
  title = "AI Chat",
  typingAnimation = true,
  showMic = true,
  showBubbleTail = true,
  onSubmit,
  onMicClick,
}) => {
  const { adjustHeight, textareaRef } = useAutoResizeTextarea({ minHeight, maxHeight })
  const [inputValue, setInputValue] = useState("")
  const [isTyping, setIsTyping] = useState(false)

  const handleReset = () => {
    if (onSubmit) onSubmit(inputValue)
    setInputValue("")
    adjustHeight(true)
  }

  return (
    <div className="w-full py-4">
      <div className="relative max-w-xl w-full mx-auto">
        <motion.div className="relative" layout transition={{ duration: 0.3, ease: "easeInOut" }}>
          {/* Chat bubble tail (toggleable) */}
          {showBubbleTail && (
            <div className="absolute -bottom-2 left-8 w-4 h-4 bg-white dark:bg-gray-800 rotate-45 border-r border-b border-gray-200 dark:border-gray-700" />
          )}

          <div className="relative bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ scale: typingAnimation && isTyping ? [1, 1.2, 1] : 1 }}
                  transition={{ duration: 0.5, repeat: isTyping ? Number.POSITIVE_INFINITY : 0 }}
                >
                  <MessageCircle className="w-4 h-4 text-blue-500" />
                </motion.div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</span>
              </div>

              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-400 rounded-full" />
                <div className="w-2 h-2 bg-yellow-400 rounded-full" />
                <div className="w-2 h-2 bg-red-400 rounded-full" />
              </div>
            </div>

            {/* Input area */}
            <div className="p-4">
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Textarea
                    placeholder={placeholder}
                    className={cn(
                      "bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl resize-none",
                      "placeholder:text-gray-400 dark:placeholder:text-gray-500",
                      "text-gray-900 dark:text-white",
                      "focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-0 focus-visible:border-transparent",
                      "min-h-[52px] max-h-[200px] py-3 px-4",
                    )}
                    ref={textareaRef}
                    value={inputValue}
                    onFocus={() => setIsTyping(true)}
                    onBlur={() => setIsTyping(false)}
                    onChange={(e) => {
                      setInputValue(e.target.value)
                      adjustHeight()
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        handleReset()
                      }
                    }}
                  />
                </div>

                <div className="flex items-center gap-2 pb-3">
                  {/* Mic button (toggleable) */}
                  {showMic && (
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={onMicClick}
                      className="p-3 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      <Mic className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    </motion.button>
                  )}

                  {/* Send button */}
                  <AnimatePresence>
                    {inputValue && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={handleReset}
                        className="p-3 rounded-full bg-blue-500 hover:bg-blue-600 text-white transition-colors"
                      >
                        <Send className="w-4 h-4" />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
