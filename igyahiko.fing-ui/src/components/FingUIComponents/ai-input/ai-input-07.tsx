"use client";

import {
  Plus,
  File,
  Camera,
  X,
  ArrowRight,
  Brain,
  ChevronDown,
  Lock,
  Unlock,
} from "lucide-react";
import {
  useState,
  useRef,
  useCallback,
  type RefObject,
} from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAutoResizeTextarea } from "@/hooks/use-auto-resizer-textarea";
import { useFileInput } from "@/hooks/use-file-input";
import { useClickOutside } from "@/hooks/use-click-outside";
import { AIInputSevenProps, Model } from "./types/types";



const defaultModels: Model[] = [
  {
    name: "GPT-4",
    description: "OpenAI’s flagship reasoning model",
  },
  {
    name: "Claude",
    description: "Anthropic’s conversational AI",
  },
  {
    name: "Gemini",
    description: "Google DeepMind’s latest multimodal model",
  },
];

const FileDisplay = ({
  fileName,
  onClear,
}: {
  fileName: string;
  onClear: () => void;
}) => (
  <div className="flex items-center gap-2 bg-black/5 dark:bg-white/5 w-fit px-3 py-1 rounded-lg">
    <File className="w-4 h-4 dark:text-white" />
    <span className="text-sm dark:text-white">{fileName}</span>
    <button
      type="button"
      onClick={onClear}
      className="ml-1 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
    >
      <X className="w-3 h-3 dark:text-white" />
    </button>
  </div>
);

export const AIInputSeven = ({
  models = defaultModels, // ✅ fallback to default models
  defaultModel,
  onSend,
}: AIInputSevenProps) => {
  const menuRef = useRef<HTMLDivElement>(null);

  const [state, setState] = useState({
    value: "",
    isPrivacyMode: false,
    selectedModel: defaultModel || models[0]?.name || "",
    isMenuOpen: false,
    isModelMenuOpen: false,
  });

  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 40,
    maxHeight: 200,
  });

  // ✅ file handling
  const {
    fileName,
    fileInputRef,
    handleFileSelect,
    clearFile,
  } = useFileInput({ accept: "image/*", maxSize: 5 });

  const updateState = useCallback(
    (updates: Partial<typeof state>) =>
      setState((prev) => ({ ...prev, ...updates })),
    []
  );

  useClickOutside(menuRef as RefObject<HTMLElement>, () => {
    if (state.isMenuOpen) updateState({ isMenuOpen: false });
    if (state.isModelMenuOpen) updateState({ isModelMenuOpen: false });
  });

  const handleSend = () => {
    if (onSend) {
      onSend({
        value: state.value,
        selectedModel: state.selectedModel,
        fileName,
        isPrivacyMode: state.isPrivacyMode,
      });
    }
    updateState({ value: "" });
    adjustHeight(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="w-full py-4">
      <div className="rounded-xl bg-black/5 dark:bg-white/5">
        <div ref={menuRef}>
          {/* Top Menu: Model + Privacy */}
          <div className="border-b border-black/10 dark:border-white/10">
            <div className="flex justify-between items-center px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400">
              {/* Model Menu */}
              <div className="relative" data-model-menu>
                <button
                  type="button"
                  onClick={() =>
                    updateState({
                      isModelMenuOpen: !state.isModelMenuOpen,
                    })
                  }
                  className="flex items-center gap-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg px-2 py-1"
                >
                  <Brain className="w-4 h-4 dark:text-white" />
                  <span className="dark:text-white">
                    {state.selectedModel || "Select model"}
                  </span>
                  <ChevronDown className="w-3 h-3 ml-0.5 dark:text-white" />
                </button>

                {state.isModelMenuOpen && (
                  <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-zinc-800 rounded-md shadow-lg py-1 z-50 border border-black/10 dark:border-white/10">
                    {models.length > 0 ? (
                      models.map((model) => (
                        <button
                          type="button"
                          key={model.name}
                          className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-2 text-sm transition-colors dark:text-white"
                          onClick={() =>
                            updateState({
                              selectedModel: model.name,
                              isModelMenuOpen: false,
                            })
                          }
                        >
                          <div className="flex items-center gap-2 flex-1">
                            {model.icon || <Brain className="w-4 h-4" />}
                            <span>{model.name}</span>
                          </div>
                          {model.description && (
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                              {model.description}
                            </span>
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                        No models available
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Privacy Toggle */}
              <button
                type="button"
                onClick={() =>
                  updateState({ isPrivacyMode: !state.isPrivacyMode })
                }
                className={cn(
                  "flex items-center gap-2 p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5",
                  state.isPrivacyMode
                    ? "text-green-600"
                    : "text-zinc-600 dark:text-zinc-400"
                )}
              >
                {state.isPrivacyMode ? (
                  <Lock className="w-4 h-4" />
                ) : (
                  <Unlock className="w-4 h-4" />
                )}
                <span>Privacy</span>
              </button>
            </div>
          </div>

          {/* File Preview */}
          {fileName && (
            <div className="px-4 pt-2">
              <FileDisplay fileName={fileName} onClear={clearFile} />
            </div>
          )}

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            hidden
            onChange={handleFileSelect}
          />

          {/* Textarea + Actions */}
          <div className="relative px-2 py-2">
            {/* Action Menu */}
            <div
              className="absolute left-3 top-1/2 -translate-y-1/2"
              data-action-menu
            >
              <button
                type="button"
                onClick={() =>
                  updateState({ isMenuOpen: !state.isMenuOpen })
                }
                className="rounded-3xl bg-black/5 dark:bg-white/5 p-2 hover:bg-black/10 dark:hover:bg-white/10"
              >
                <Plus className="w-4 h-4 dark:text-white" />
              </button>

              {state.isMenuOpen && (
                <div className="absolute left-0 top-full mt-1 bg-white dark:bg-zinc-800 rounded-md shadow-lg py-1 min-w-[140px] z-50 border border-black/10 dark:border-white/10">
                  {[
                    {
                      icon: File,
                      label: "Upload File",
                      onClick: () => fileInputRef.current?.click(),
                    },
                    { icon: Camera, label: "Take Photo" },
                  ].map(({ icon: Icon, label, onClick }) => (
                    <button
                      type="button"
                      key={label}
                      onClick={onClick}
                      className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5 text-sm transition-colors dark:text-white"
                    >
                      <Icon className="w-4 h-4 dark:text-white" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Text Input */}
            <Textarea
              ref={textareaRef}
              value={state.value}
              placeholder="Type your message..."
              className={cn(
                "w-full rounded-xl pl-14 pr-10 border-none resize-none bg-transparent dark:text-white placeholder:text-black/70 dark:placeholder:text-white/70",
                "min-h-[40px]"
              )}
              onKeyDown={handleKeyDown}
              onChange={(e) => {
                updateState({ value: e.target.value });
                adjustHeight();
              }}
            />

            {/* Send Button */}
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl bg-black/5 dark:bg-white/5 p-1"
              onClick={handleSend}
            >
              <ArrowRight
                className={cn(
                  "w-4 h-4 dark:text-white",
                  state.value ? "opacity-100" : "opacity-30"
                )}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
