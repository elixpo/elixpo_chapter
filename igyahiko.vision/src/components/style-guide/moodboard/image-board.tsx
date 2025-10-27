import { MoodboardImageProps } from "@/redux/api/moodboard";
import Image from "next/image";
import React from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type ImageBoardProps = {
  image: MoodboardImageProps;
  removeImage: (id: string) => void;
  xOffset: number;
  yOffset: number;
  rotation: number;
  zIndex: number;
  marginLeft: string;
  marginTop: string;
};

const ImageBoard = ({
  image,
  marginLeft,
  marginTop,
  removeImage,
  rotation,
  xOffset,
  yOffset,
  zIndex,
}: ImageBoardProps) => {
  return (
    <div
      key={`board-${image.id}`}
      className={cn(
        "absolute group rounded-xl overflow-hidden border border-muted-foreground/20 shadow-md transition-transform duration-300 hover:scale-[1.02]"
      )}
      style={{
        transform: `translate(${xOffset}px, ${yOffset}px) rotate(${rotation}deg)`,
        zIndex,
        left: "60%",
        top: "50%",
        marginLeft,
        marginTop,
      }}
    >
      <Image
       alt=""
        src={image.preview}
        width={160}
        height={160}
        className="object-cover rounded-xl w-40 h-50"
      />

      {/* Upload Status Overlay */}
      <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm text-white px-2 py-1 rounded-lg text-xs flex items-center gap-1">
        <UploadStatus
          uploaded={image.uploaded}
          uploading={image.uploading}
          error={image?.error}
        />
      </div>

      {/* Remove Button */}
      <Button
        onClick={() => removeImage(image.id)}
        className="absolute top-2  right-2 group-hover:opacity-100 transition-opacity duration-200 bg-black/60 hover:bg-red-600 text-white rounded-full p-1"
      >
        <XCircle className="w-4 h-4" />
      </Button>
    </div>
  );
};

export default ImageBoard;

interface UploadStatusProps {
  uploading: boolean;
  uploaded: boolean;
  error?: string;
}

export const UploadStatus = ({ uploading, uploaded, error }: UploadStatusProps) => {
  if (uploading)
    return (
      <div className=" ">
        <Loader2 className="w-5 h-5  animate-spin text-green-400" />
      
      </div>
    );

  if (uploaded)
    return (
      <>
        <CheckCircle2 className="w-5 h-5 text-green-400" />
       
      </>
    );

  if (error)
    return (
      <>
        <XCircle className="w-3 h-3 text-red-400" />
        <span>{error || "Failed"}</span>
      </>
    );

  return null;
};
