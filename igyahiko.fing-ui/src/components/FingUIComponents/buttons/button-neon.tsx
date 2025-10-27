"use client"

import type React from "react"
import { useRef, useEffect } from "react"
import { motion } from "framer-motion"
import { gsap } from "gsap"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { NeonBorderButtonProps } from "./types/types"



export const ButtonNeon = ({
  children,
  className,
  onClick,
  glowColor = "#ffffff", // default white glow
  glowIntensity = 20,
  duration = 1.5,
  repeat = -1,
  yoyo = true,
  type = "button",
  disabled = false,
}: NeonBorderButtonProps) => {
  const borderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const border = borderRef.current
    if (!border) return

    gsap.to(border, {
      boxShadow: `0 0 ${glowIntensity}px ${glowColor}, 0 0 ${glowIntensity * 2}px ${glowColor}, 0 0 ${glowIntensity * 3}px ${glowColor}`,
      duration,
      repeat,
      yoyo,
      ease: "power2.inOut",
    })
  }, [glowColor, glowIntensity, duration, repeat, yoyo])

  return (
    <div className="relative inline-block">
      <div
        ref={borderRef}
        className="absolute inset-0 rounded-lg border-2"
        style={{
          borderColor: glowColor,
          boxShadow: `0 0 ${glowIntensity / 2}px ${glowColor}`,
        }}
      />
      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
        <Button
          type={type}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            "relative bg-black hover:bg-gray-900 text-white font-mono px-8 py-3 rounded-lg border-0",
            className,
          )}
        >
          {children}
        </Button>
      </motion.div>
    </div>
  )
}
