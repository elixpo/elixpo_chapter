import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


export const combineSlug = (name: string, maxLen=80):string => {
   const baseName = name
   if(!baseName) return 'vision_guest'
   let s = baseName
        .normalize('NFKC')
        .replace(/\p{M}+/gu,"")
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9]/g, '')
        if(!s) s = 'untitled'
        if(s.length > maxLen) s = s.slice(0, maxLen)
        return s 
}
export const polylineBox = (
  points: ReadonlyArray<{ x: number; y: number }>
) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < points.length; i++) {
    const { x, y } = points[i];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
};
