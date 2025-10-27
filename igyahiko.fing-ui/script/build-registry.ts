import { registry } from "../registry";
import { promises as fs } from "fs";
import type { z } from "zod";
import type { registryItemFileSchema } from "../registry/schema";
import path from "path";

const REGISTRY_BASE_PATH = process.cwd();
const PUBLIC_FOLDER_BASE_PATH = "public/r";

type File = z.infer<typeof registryItemFileSchema>;

async function writeFileRecursive(filePath: string, data: string) {
  const dir = path.dirname(filePath);

  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, data, "utf-8");
    console.log(`File written to ${filePath}`);
  } catch (error) {
    console.error(`Error writing file ${filePath}`);
    console.error(error);
  }
}

const getComponentFiles = async (files: File[], registryType: string) => {
  const filesArrayPromises = (files ?? []).map(async (file) => {
    if (typeof file === "string") {
      // Handle string file paths
      const normalizedPath = file.startsWith("/") ? file.slice(1) : file;
      const filePath = path.join(REGISTRY_BASE_PATH, normalizedPath);
      const fileName = path.basename(normalizedPath);

      // ✅ Use safe relative target paths (NO leading /)
      let targetPath: string;
      if (normalizedPath.includes("components/FingUIComponents")) {
        targetPath = `src/components/FingUIComponents/${fileName}`;
      } else if (normalizedPath.includes("components/types")) {
        targetPath = `src/components/types/${fileName}`;
      } else if (normalizedPath.includes("components/buttons")) {
        targetPath = `src/components/buttons/${fileName}`;
      } else if (normalizedPath.includes("components/dropdown")) {
        targetPath = `src/components/dropdown/${fileName}`;
      } else if (normalizedPath.includes("components/landing")) {
        targetPath = `src/components/landing/${fileName}`;
      } else if (normalizedPath.includes("hooks")) {
        targetPath = `src/hooks/${fileName}`;
      } else {
        targetPath = `src/components/${fileName}`;
      }

      try {
        const fileContent = await fs.readFile(filePath, "utf-8");

        return {
          type: registryType,
          content: fileContent,
          path: normalizedPath,
          target: targetPath,
        };
      } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        throw error;
      }
    } else {
      // Handle file objects
      const normalizedPath = file.path.startsWith("/")
        ? file.path.slice(1)
        : file.path;
      const filePath = path.join(REGISTRY_BASE_PATH, normalizedPath);
      const fileName = path.basename(normalizedPath);
      const fileType = file.type || registryType;

      // ✅ Safe relative target path
      const targetPath =
        file.target || `src/components/FingUIComponents/${fileName}`;

      try {
        const fileContent = await fs.readFile(filePath, "utf-8");

        return {
          type: fileType,
          content: fileContent,
          path: normalizedPath,
          target: targetPath,
        };
      } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        throw error;
      }
    }
  });

  const filesArray = await Promise.all(filesArrayPromises);
  return filesArray;
};

const main = async () => {
  try {
    // Create public/r directory if it doesn't exist
    await fs.mkdir(PUBLIC_FOLDER_BASE_PATH, { recursive: true });

    for (let i = 0; i < registry.length; i++) {
      const component = registry[i];
      const files = component.files;

      if (!files || files.length === 0) {
        console.warn(`No files found for component: ${component.name}`);
        continue;
      }

      try {
        const filesArray = await getComponentFiles(files, component.type);
        const json = JSON.stringify(
          {
            ...component,
            files: filesArray,
          },
          null,
          2
        );

        const jsonPath = path.join(
          PUBLIC_FOLDER_BASE_PATH,
          `${component.name}.json`
        );
        await writeFileRecursive(jsonPath, json);
        console.log(`Created registry file for: ${component.name}`);
      } catch (error) {
        console.error(`Error processing component ${component.name}:`, error);
      }
    }
  } catch (error) {
    console.error("Error in main function:", error);
  }
};

main()
  .then(() => {
    console.log("Registry build completed");
  })
  .catch((err) => {
    console.error("Registry build failed:", err);
    process.exit(1);
  });
