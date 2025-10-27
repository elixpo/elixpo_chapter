"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

type RefreshButtonProps = {
  onRefresh?: () => Promise<void> | void; // custom refresh logic
  size?: number; // icon size
  className?: string; // extra styling
  spinDuration?: number; // ms to spin
};

export default function RefreshButton({
  onRefresh,
  size = 24,
  className = "",
  spinDuration = 800,
}: RefreshButtonProps) {
  const [spinning, setSpinning] = useState(false);

  const handleClick = async () => {
    setSpinning(true);
    if (onRefresh) {
      await onRefresh();
    }
    setTimeout(() => setSpinning(false), spinDuration);
  };

  return (
    <button
      onClick={handleClick}
      className={`relative flex items-center justify-center p-3 rounded-full 
        bg-gradient-to-r from-slate-800 to-slate-900 
        hover:from-slate-700 hover:to-slate-800 
        text-white shadow-lg transition-all duration-300 ease-out 
        hover:scale-105 active:scale-95 ${className}`}
    >
      <RefreshCw
        className={`transition-transform duration-700 ${
          spinning ? "animate-spin" : ""
        }`}
        size={size}
      />
    </button>
  );
}
