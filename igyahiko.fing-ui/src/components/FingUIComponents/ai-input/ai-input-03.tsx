"use client";

import { Mic } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface AIInputThreeProps {
  demo?: boolean;
  autoResetTime?: number;
  pulseBars?: number;
  barMinHeight?: number;
  barMaxHeight?: number;
  useSpeechRecognition?: boolean; // enable speech recognition
  onStart?: () => void;
  onStop?: (duration: number) => void;
  onSubmit?: (transcript: string, duration: number) => void; // user’s spoken response
}

export const AIInputThree = ({
  demo = true,
  autoResetTime = 3000,
  pulseBars = 48,
  barMinHeight = 20,
  barMaxHeight = 80,
  useSpeechRecognition = false,
  onStart,
  onStop,
  onSubmit,
}: AIInputThreeProps) => {
    
  const [submitted, setSubmitted] = useState(false);
  const [time, setTime] = useState(0);
  const [isClient, setIsClient] = useState(false);
  const [isDemo, setIsDemo] = useState(demo);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    setIsClient(true);
    if (useSpeechRecognition && typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let currentTranscript = "";
          //@ts-ignore
          for (let i = event.resultIndex; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          setTranscript(currentTranscript.trim());
        };

        recognitionRef.current = recognition;
      }
    }
  }, [useSpeechRecognition]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (submitted) {
      intervalId = setInterval(() => {
        setTime((t) => t + 1);
      }, 1000);
    } else {
      setTime(0);
    }

    return () => clearInterval(intervalId);
  }, [submitted]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  // Demo loop
  useEffect(() => {
    if (!isDemo) return;

    let timeoutId: NodeJS.Timeout;
    const runAnimation = () => {
      setSubmitted(true);
      onStart?.();
      timeoutId = setTimeout(() => {
        setSubmitted(false);
        onStop?.(time);
        onSubmit?.("Demo transcript", time);
        timeoutId = setTimeout(runAnimation, 1000);
      }, autoResetTime);
    };

    const initialTimeout = setTimeout(runAnimation, 100);
    return () => {
      clearTimeout(timeoutId);
      clearTimeout(initialTimeout);
    };
  }, [isDemo, autoResetTime, onStart, onStop, onSubmit, time]);

  const handleClick = () => {
    if (isDemo) {
      setIsDemo(false);
      setSubmitted(false);
      return;
    }

    if (!submitted) {
      setSubmitted(true);
      onStart?.();
      if (useSpeechRecognition && recognitionRef.current) {
        recognitionRef.current.start();
        setTranscript("");
      }
    } else {
      setSubmitted(false);
      onStop?.(time);
      if (useSpeechRecognition && recognitionRef.current) {
        recognitionRef.current.stop();
        onSubmit?.(transcript, time);
      } else {
        onSubmit?.("", time);
      }
    }
  };

  return (
    <div className="w-full py-4">
      <div className="relative max-w-xl w-full mx-auto flex items-center flex-col gap-2">
        <button
          className={cn(
            "group w-16 h-16 rounded-xl flex items-center justify-center transition-colors",
            submitted
              ? "bg-none"
              : "bg-none hover:bg-black/10 dark:hover:bg-white/10"
          )}
          type="button"
          onClick={handleClick}
        >
          {submitted ? (
            <div
              className="w-6 h-6 rounded-sm animate-spin bg-black  dark:bg-white cursor-pointer pointer-events-auto"
              style={{ animationDuration: "3s" }}
            />
          ) : (
            <Mic className="w-6 h-6 text-black/70 dark:text-white/70" />
          )}
        </button>

        <span
          className={cn(
            "font-mono text-sm transition-opacity duration-300",
            submitted
              ? "text-black/70 dark:text-white/70"
              : "text-black/30 dark:text-white/30"
          )}
        >
          {formatTime(time)}
        </span>

        <div className="h-4 w-64 flex items-center justify-center gap-0.5">
          {[...Array(pulseBars)].map((_, i) => (
            <div
              key={i}
              className={cn(
                "w-0.5 rounded-full transition-all duration-300",
                submitted
                  ? "bg-black/50 dark:bg-white/50 animate-pulse"
                  : "bg-black/10 dark:bg-white/10 h-1"
              )}
              style={
                submitted && isClient
                  ? {
                      height: `${
                        barMinHeight +
                        Math.random() * (barMaxHeight - barMinHeight)
                      }%`,
                      animationDelay: `${i * 0.05}s`,
                    }
                  : undefined
              }
            />
          ))}
        </div>

        <p className="h-4 text-xs text-black/70 dark:text-white/70">
          {submitted ? "Listening..." : "Click to speak"}
        </p>
      </div>
    </div>
  );
}
