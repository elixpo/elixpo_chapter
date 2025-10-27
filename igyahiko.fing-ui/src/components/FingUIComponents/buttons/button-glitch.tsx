"use client"

import type React from "react"
import { useRef, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { gsap } from "gsap"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { GlitchButtonProps } from "./types/types"


export const ButtonGlitch = ({
  children,
  className,
  onClick,
  type = "button",
  disabled = false,
  glitch = true,
  glitchInterval = 3000,
  glitchDuration = 0.1,
  glitchColors = { primary: "#ff0000", secondary: "#00ffff" },
  variant = "primary",
}: GlitchButtonProps) => {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [isGlitching, setIsGlitching] = useState(false)

  useEffect(() => {
    if (!glitch) return
    const button = buttonRef.current
    if (!button) return

    const glitchAnimation = () => {
      setIsGlitching(true)

      gsap
        .timeline()
        .to(button, { x: -2, duration: glitchDuration })
        .to(button, { x: 2, duration: glitchDuration })
        .to(button, { x: -1, duration: glitchDuration })
        .to(button, { x: 1, duration: glitchDuration })
        .to(button, { x: 0, duration: glitchDuration })
        .call(() => setIsGlitching(false))
    }

    const interval = setInterval(glitchAnimation, glitchInterval)
    return () => clearInterval(interval)
  }, [glitch, glitchInterval, glitchDuration])

  const baseStyles = {
    primary: "bg-red-600 hover:bg-red-700 text-white border-2 border-red-400",
    secondary: "bg-blue-600 hover:bg-blue-700 text-white border-2 border-blue-400",
    ghost: "bg-transparent border-2 border-gray-400 text-gray-700 hover:bg-gray-100",
    default: "bg-gray-800 hover:bg-gray-900 text-white border-2 border-gray-700",
  }

  return (
    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
      <Button
        ref={buttonRef}
        onClick={onClick}
        type={type}
        disabled={disabled}
        className={cn(
          "relative font-mono px-8 py-3 rounded transition-colors",
          baseStyles[variant],
          isGlitching &&
            `shadow-[2px_0_0_${glitchColors.primary},-2px_0_0_${glitchColors.secondary}]`,
          className,
        )}
        style={{
          textShadow: isGlitching
            ? `2px 0 0 ${glitchColors.primary}, -2px 0 0 ${glitchColors.secondary}`
            : "none",
        }}
      >
        {children}
      </Button>
    </motion.div>
  )
}
