"use client";

import React, { forwardRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type MotionButtonProps = React.ComponentPropsWithoutRef<typeof motion.button>;

interface LiquidGlassButtonProps extends MotionButtonProps {
  size?: "sm" | "md" | "lg";
  variant?: "default" | "subtle";
  children: React.ReactNode;
}

export const LiquidGlassButton = forwardRef<HTMLButtonElement, LiquidGlassButtonProps>(
  ({ className, size = "md", variant = "default", children, ...props }, ref) => {
    const sizeClasses = {
      sm: "px-3 py-2 text-xs",
      md: "px-4 py-1.2 text-xs",
      lg: "px-4 py-1.2 text-xs",
    }[size];

    const variantClasses = {
      default:
        "bg-white/10 border border-white/20 hover:bg-white/15 text-white",
      subtle:
        "bg-white/5 border border-white/10 hover:bg-white/10 text-white/90",
    }[variant];

    return (
     <motion.button
     ref={ref}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      style={{

      }}
      className={
        cn(
            'flex gap-2 items-center font-mono text-xs rounded-2xl',
            "rounded-2xl backdrop-blur-xl transition-all duration-300",
          "shadow-[inset_0_0_6px_rgba(255,255,255,0.05),0_0_6px_rgba(255,255,255,0.05)]",
          "isolate z-10", 
            sizeClasses,
            variantClasses
        )
      }
     >
        {children}
     </motion.button>
    );
  }
);

LiquidGlassButton.displayName = "LiquidGlassButton";
