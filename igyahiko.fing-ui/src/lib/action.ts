"use server";

import path from "path";
import { promises as fs } from "fs";
import { cache } from "react";

const readFileCache = cache(async (filePath: string) => {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error: any) {
    throw new Error(`Unable to read file at ${filePath}: ${error.message}`);
  }
});

export const getComponent = async (
  fileName: string | null,
  folder: string | null
) => {
  if (!folder) {
    throw new Error("❌ Folder path is required");
  }

  const baseDir = path.join(process.cwd(), "components/FingUIComponents");

  // Case 1: only folder, no fileName → look for index.tsx
  if (!fileName || fileName === "undefined") {
    const fullPath = path.join(baseDir, folder, "index.tsx");
    return await readFileCache(fullPath);
  }

  // Case 2: folder + fileName (try .tsx first, fallback to .mdx)
  const tsxPath = path.join(baseDir, folder, `${fileName}.tsx`);
  const mdxPath = path.join(baseDir, folder, `${fileName}.mdx`);

  try {
    return await readFileCache(tsxPath);
  } catch {
    try {
      return await readFileCache(mdxPath);
    } catch {
      throw new Error(
        `❌ Component not found: Expected ${tsxPath} or ${mdxPath}`
      );
    }
  }
};

// NEW: Function to get component content for display
export const getComponentContent = async (fileName: string | null, folder: string | null) => {
  try {
    if (!folder) {
      return { content: null, error: "Folder path is required" };
    }

    const content = await getComponent(fileName, folder);
    return { content, error: null };
  } catch (error: any) {
    return { content: null, error: error.message };
  }
};

export type CopyComponentState = {
  error: string;
  content: string;
  success: boolean;
};

export const copyComponent = async (
  prevState: CopyComponentState,
  formData: FormData
): Promise<CopyComponentState> => {
  try {
    const folder = formData.get("folder") as string | null;
    const fileName = formData.get("fileName") as string | null;

    if (!folder) {
      return {
        error: "Folder not found",
        content: "",
        success: false,
      };
    }

    const content = await getComponent(fileName, folder);

    if (!content) {
      return {
        error: "Component not found",
        content: "",
        success: false,
      };
    }

    return {
      error: "",
      content,
      success: true,
    };
  } catch (error) {
    console.error(error);
    return {
      error: "Failed to copy component",
      content: "",
      success: false,
    };
  }
};