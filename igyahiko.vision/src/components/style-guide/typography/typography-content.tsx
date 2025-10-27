import { TypeIcon, InfoIcon } from "lucide-react";
import React from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type TypographyContentProps = {
  typographyGuide: Array<{
    title: string;
    style: Array<{
      name: string;
      fontFamily: string;
      fontSize: string;
      fontWeight: string;
      lineWeight: string;
      letterSpacing: string;
      description: string;
    }>;
  }>;
};

const TypographyContent = ({ typographyGuide }: TypographyContentProps) => {
  const isEmpty = !typographyGuide || typographyGuide.length === 0;

  return (
    <div className="w-full">
      {isEmpty ? (
        <div className="space-y-8">
          <div className="text-center py-24">
            <div className="flex flex-col items-center">
              <div className="bg-muted w-16 h-16 rounded-md flex items-center justify-center">
                <TypeIcon className="w-8 h-8 text-muted-foreground" />
              </div>
              <span
                className="capitalize mt-3 font-black text-2xl"
                style={{
                  fontFamily: "var(--font-montserrat-alternates)",
                }}
              >
                No Font Generated Yet
              </span>
              <p className="font-mono text-xs md:text-md mt-1 opacity-50 max-w-md">
                Upload images to your mood board and generate an AI-powered style
                guide with colors and typography.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <TooltipProvider>
          <div className="flex flex-col gap-10">
            {typographyGuide.map((section, index) => (
              <div className="flex flex-col gap-6" key={index}>
                <div>
                  <h3 className="text-lg font-bold font-mono border-b pb-1 border-border/20">
                    {section.title}
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {section.style.map((style, styleIndex) => (
                    <div
                      key={styleIndex}
                      className={cn(
                        "flex flex-col gap-2 p-4 rounded-xl border border-border/20 hover:border-border transition-colors"
                      )}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-sm text-muted-foreground uppercase">
                            {style.name}
                          </h4>
                         

                          {/* Tooltip Icon */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button className="p-1 hover:bg-muted rounded-md">
                                <InfoIcon className="w-3.5 h-3.5 text-muted-foreground" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="max-w-xs font-mono text-xs"
                            >
                              <div className="space-y-1">
                                <p>
                                  <span className="font-semibold">Font:</span>{" "}
                                  {style.fontFamily}
                                </p>
                                <p>
                                  <span className="font-semibold">Size:</span>{" "}
                                  {style.fontSize}
                                </p>
                                <p>
                                  <span className="font-semibold">Weight:</span>{" "}
                                  {style.fontWeight}
                                </p>
                                <p>
                                  <span className="font-semibold">Line Height:</span>{" "}
                                  {style.lineWeight}
                                </p>
                                <p>
                                  <span className="font-semibold">Letter Spacing:</span>{" "}
                                  {style.letterSpacing}
                                </p>
                                
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </div>

                        <span className="text-xs font-mono opacity-60">
                          {style.fontFamily}
                        </span>
                      </div>

                      {/* Sample Preview Text */}
                      <p
                        className="truncate"
                        style={{
                          fontFamily: style.fontFamily,
                          fontSize: style.fontSize,
                          fontWeight: style.fontWeight as any,
                          lineHeight: style.lineWeight,
                          letterSpacing: `${style.letterSpacing}px`,
                        }}
                      >
                        The quick brown fox jumps over the lazy dog
                      </p>
                       <p className="font-mono text-xs">{style.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
};

export default TypographyContent;
