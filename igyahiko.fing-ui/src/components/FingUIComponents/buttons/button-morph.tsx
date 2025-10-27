"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ButtonMorphProps } from "./types/types";

export const ButtonMorph: React.FC<ButtonMorphProps> = ({
  children,
  initialRadius = "0.5rem",
  morphedRadius = "9999px",
  initialWidth = "10rem",
  morphedWidth = "6rem",
  duration = 0.6,
  ease = "easeInOut",
  startMorphed = false,
  className,
  onClick,
  type = "button",
  disabled,
  ...props
}) => {
  const [morphed, setMorphed] = useState(startMorphed);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    setMorphed((prev) => !prev);
    if (onClick) onClick(e);
  };

  return (
    <motion.div
      className="inline-flex"
      animate={{
        borderRadius: morphed ? morphedRadius : initialRadius,
        width: morphed ? morphedWidth : initialWidth,
      }}
      transition={{ duration, ease }}
    >
      <Button
        type={type}
        disabled={disabled}
        onClick={handleClick}
        className={`w-full font-mono font-medium  ${className ?? ""}`}
        {...props}
      > 
        {children || "Spank Me"}
      </Button>
    </motion.div>
  );
};
