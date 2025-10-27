import React from "react";

export interface ButtonMorphProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode; // user-defined content
  initialRadius?: string;
  morphedRadius?: string;
  initialWidth?: string;
  morphedWidth?: string;
  duration?: number;
  ease?: "easeInOut" | "easeOut" | "easeIn" | "linear";
  startMorphed?: boolean;
  className?: string;
}

export interface GlitchButtonProps {
  children: React.ReactNode
  className?: string
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  type?: "button" | "submit" | "reset"
  disabled?: boolean
  /** Enable/disable glitch animation */
  glitch?: boolean
  /** Interval in ms between glitches */
  glitchInterval?: number
  /** Duration of one glitch animation */
  glitchDuration?: number
  /** Glitch color scheme */
  glitchColors?: {
    primary: string
    secondary: string
  }
  /** Variant like normal button: primary/secondary/ghost/etc */
  variant?: "default" | "primary" | "secondary" | "ghost"
}


export interface NeonBorderButtonProps {
  children: React.ReactNode
  className?: string
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  glowColor?: string // customize glow color
  glowIntensity?: number // strength of glow
  duration?: number // glow animation duration
  repeat?: number // how many times the glow loops (-1 = infinite)
  yoyo?: boolean // whether the glow reverses
  type?: "button" | "submit" | "reset"
  disabled?: boolean
}