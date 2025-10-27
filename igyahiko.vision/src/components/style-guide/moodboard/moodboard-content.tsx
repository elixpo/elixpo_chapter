'use client'
import { MoodboardImageProps } from "@/redux/api/moodboard";
import { PlusCircleIcon, SparklesIcon } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useMoodBoard } from "@/hooks/use-moodboard";
import { Button } from "../../ui/button";
import ImageBoard from "./image-board";

type MoodboardProps = {
  moodboardGuide: MoodboardImageProps[];
};
const fixedPositions = [
  { x: -200, y: -50, rotate: -12 },
  { x: 180, y: -60, rotate: 10 },
  { x: -120, y: 120, rotate: 8 },
  { x: 160, y: 100, rotate: -9 },
  { x: 0, y: 0, rotate: 3 },
];

const MoodBoardContent = ({ moodboardGuide }: MoodboardProps) => {

  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    addImage,
    canAddmore,
    handleDrag,
    handleDragDrop,
    handleFileInput,
    images,
    removeImage,
  } = useMoodBoard(moodboardGuide);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
    handleDrag(e);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleDrag(e);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleDragDrop(e);
  };

  const isEmpty = !images || images.length === 0;
  const canAddMore = images.length <= 5;

  const triggerFileUpload = () => {
    if (canAddMore) fileInputRef.current?.click();
  };
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkScreen = () => setIsMobile(window.innerWidth < 768);
    checkScreen();
    window.addEventListener("resize", checkScreen);
    return () => window.removeEventListener("resize", checkScreen);
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={cn(
          "relative border-2 border-dashed border-muted-foreground/30 rounded-3xl p-12 text-center transition-all duration-200 min-h-[400px] flex items-center justify-center overflow-hidden",
          isDragging &&
            "border-primary/60 bg-primary/5 scale-[1.01] shadow-[0_0_25px_-5px_rgba(var(--primary-rgb),0.5)]"
        )}
      >
        <span className="font-mono absolute top-5 left-8 font-bold">
          Mood Board
        </span>

        <div
          className="absolute inset-0 -z-10 
            bg-[radial-gradient(circle,rgba(0,0,0,0.06)_1px,transparent_1px),radial-gradient(circle,rgba(0,0,0,0.06)_1px,transparent_1px)]
            dark:bg-[radial-gradient(circle,rgba(255,255,255,0.1)_1px,transparent_1px),radial-gradient(circle,rgba(255,255,255,0.1)_1px,transparent_1px)]
            [background-position:0_0,8px_8px]
            [background-size:16px_28px]"
        />

        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-20 rounded-3xl" />

        {/* Hidden file input */}
        <input
          id="file-input"
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />

        {/* Empty state */}
        {isEmpty ? (
          <div className="flex z-10 flex-col items-center">
            <span
              style={{
                fontFamily: "var(--font-montserrat-alternates)",
              }}
              className="font-mono text-xl md:text-4xl"
            >
              Moodboard is Empty
            </span>
            <p className="font-mono opacity-70 text-xs mt-1 capitalize">
              Upload images in the moodboard to generate something cool
            </p>

            <Button
              variant="secondary"
              className="font-mono text-xs rounded-3xl mt-2 font-black flex items-center gap-1"
              onClick={triggerFileUpload}
            >
              <PlusCircleIcon className="w-4 h-4" />
              Upload
            </Button>
          </div>
        ) : (
          // Images stacked center
         <div className="absolute inset-0 flex items-center justify-center">
  <div className="relative w-[150px] flex items-center justify-center">
    {images.map((img, i) => {
      const seed = img.id
        .split("")
        .reduce((a, b) => a + b.charCodeAt(0), 0);
      const random1 = ((seed * 9301 + 49297) % 233280) / 233280;
      const random2 = (((seed + 1) * 9301 + 49297) % 233280) / 233280;
      const random3 = (((seed + 2) * 9301 + 49297) % 233280) / 233280;
      const rotation = (random1 - 0.5) * 30;
      const XOffSet = (random2 - 0.5) * 20;
      const yOffSet = (random3 - 0.5) * 10;

      // fixed positions for desktop
      const fixedPositions = [
        { x: 400, y: 0 },
        { x: 200, y: 0 },
        { x: 0, y: 0 },
        { x: -200, y: 0 },
        { x: -400, y: 0 },
      ];

      // apply fixed or random positions based on screen size
      const isMobile =
        typeof window !== "undefined" && window.innerWidth < 768;
      const finalX = isMobile ? XOffSet : fixedPositions[i]?.x || 0;
      const finalY = isMobile ? yOffSet : fixedPositions[i]?.y || 0;

      return (
        <ImageBoard
          key={`mobile-${img.id}`}
          rotation={rotation}
          xOffset={finalX}
          yOffset={finalY}
          image={img}
          marginLeft="-100px"
          marginTop="-96px"
          zIndex={i + 1}
          removeImage={removeImage}
        />
      );
    })}
  </div>

  {/* Add More button */}
  {canAddMore && (
    <div className="absolute bottom-6 flex justify-center">
      <Button
        variant="secondary"
        className="font-mono text-xs rounded-3xl font-bold flex items-center gap-1"
        onClick={triggerFileUpload}
      >
        <PlusCircleIcon className="w-4 h-4" />
        Add More
      </Button>
    </div>
  )}
</div>

        )}
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between px-0 md:px-2">
        <span className="font-mono text-xs opacity-70 font-light w-fit text-center md:w-[30%]">
          Just drag and drop images here to create a mood board and we will
          create a style guide for you.
        </span>

        <Button
          className="font-mono font-bold mt-3 md:mt-0 capitalize rounded-3xl"
          variant={"default"}
        >
          <SparklesIcon className="fill-amber-300" /> Generate With AI
        </Button>
      </div>
    </div>
  );
};

export default MoodBoardContent;
