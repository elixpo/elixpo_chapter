import * as fs from 'fs';
import * as path from 'path';

/**
 * Represents a file in the template structure
 */
export interface TemplateFile {
  filename: string;
  fileExtension: string;
  content: string;
}

/**
 * Represents a folder in the template structure which can contain files and other folders
 */
export interface TemplateFolder {
  folderName: string;
  items: (TemplateFile | TemplateFolder)[];
}

/**
 * Type representing either a file or folder in the template structure
 */
export type TemplateItem = TemplateFile | TemplateFolder;

/**
 * Options for scanning template directories
 */
interface ScanOptions {
  /**
   * Files to ignore (exact filenames with extensions)
   */
  ignoreFiles?: string[];
  
  /**
   * Folders to ignore (exact folder names)
   */
  ignoreFolders?: string[];
  
  /**
   * File patterns to ignore (regex patterns)
   */
  ignorePatterns?: RegExp[];
  
  /**
   * Maximum size of file to include content (in bytes)
   * Files larger than this will have a placeholder message instead of content
   */
  maxFileSize?: number;
}

/**
 * Scans a template directory and returns a structured JSON representation
 * 
 * @param templatePath - Path to the template directory
 * @param options - Scanning options to customize behavior
 * @returns Promise resolving to the template structure as JSON
 */
export async function scanTemplateDirectory(
  templatePath: string,
  options: ScanOptions = {}
): Promise<TemplateFolder> {
  // Set default options
  const defaultOptions: ScanOptions = {
    ignoreFiles: [
      'package-lock.json',
      'yarn.lock',
      '.DS_Store',
      'thumbs.db',
      '.gitignore',
      '.npmrc',
      '.yarnrc',
      '.env',
      '.env.local',
      '.env.development',
      '.env.production'
    ],
    ignoreFolders: [
      'node_modules',
      '.git',
      '.vscode',
      '.idea',
      'dist',
      'build',
      'coverage'
    ],
    ignorePatterns: [
      /^\..+\.swp$/,  // Vim swap files
      /^\.#/,         // Emacs backup files
      /~$/            // Backup files
    ],
    maxFileSize: 1024 * 1024 // 1MB
  };
  
  // Merge provided options with defaults
  const mergedOptions: ScanOptions = {
    ignoreFiles: [...(defaultOptions.ignoreFiles || []), ...(options.ignoreFiles || [])],
    ignoreFolders: [...(defaultOptions.ignoreFolders || []), ...(options.ignoreFolders || [])],
    ignorePatterns: [...(defaultOptions.ignorePatterns || []), ...(options.ignorePatterns || [])],
    maxFileSize: options.maxFileSize !== undefined ? options.maxFileSize : defaultOptions.maxFileSize
  };

  // Validate the input path
  if (!templatePath) {
    throw new Error('Template path is required');
  }

  // Check if the template path exists
  try {
    const stats = await fs.promises.stat(templatePath);
    if (!stats.isDirectory()) {
      throw new Error(`'${templatePath}' is not a directory`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Template directory '${templatePath}' does not exist`);
    }
    throw error;
  }

  // Get the folder name from the path
  const folderName = path.basename(templatePath);

  // Process the directory and return the result
  return processDirectory(folderName, templatePath, mergedOptions);
}

/**
 * Process a directory and its contents recursively
 * 
 * @param folderName - Name of the current folder
 * @param folderPath - Path to the current folder
 * @param options - Scanning options
 * @returns Promise resolving to a TemplateFolder object
 */
async function processDirectory(
  folderName: string, 
  folderPath: string, 
  options: ScanOptions
): Promise<TemplateFolder> {
  try {
    // Read directory contents
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    const items: TemplateItem[] = [];

    // Process each entry in the directory
    for (const entry of entries) {
      const entryName = entry.name;
      const entryPath = path.join(folderPath, entryName);

      // Check if this entry should be skipped
      if (entry.isDirectory()) {
        // Skip ignored folders
        if (options.ignoreFolders?.includes(entryName)) {
          console.log(`Skipping ignored folder: ${entryPath}`);
          continue;
        }
        
        // If it's a directory, process it recursively
        const subFolder = await processDirectory(entryName, entryPath, options);
        items.push(subFolder);
      } else if (entry.isFile()) {
        // Skip ignored files
        if (options.ignoreFiles?.includes(entryName)) {
          console.log(`Skipping ignored file: ${entryPath}`);
          continue;
        }
        
        // Check against regex patterns
        const shouldSkip = options.ignorePatterns?.some(pattern => pattern.test(entryName));
        if (shouldSkip) {
          console.log(`Skipping file matching ignore pattern: ${entryPath}`);
          continue;
        }
        
        // If it's a file, get its details
        try {
          const stats = await fs.promises.stat(entryPath);
          const parsedPath = path.parse(entryName);
          let content: string;
          
          // Check file size before reading content
          if (options.maxFileSize && stats.size > options.maxFileSize) {
            content = `[File content not included: size (${stats.size} bytes) exceeds maximum allowed size (${options.maxFileSize} bytes)]`;
          } else {
            content = await fs.promises.readFile(entryPath, 'utf8');
          }
          
          items.push({
            filename: parsedPath.name,
            fileExtension: parsedPath.ext.replace(/^\./, ''), // Remove leading dot
            content
          });
        } catch (error) {
          console.error(`Error reading file ${entryPath}:`, error);
          // Still include the file but with an error message as content
          const parsedPath = path.parse(entryName);
          items.push({
            filename: parsedPath.name,
            fileExtension: parsedPath.ext.replace(/^\./, ''),
            content: `Error reading file: ${(error as Error).message}`
          });
        }
      }
      // Ignore other types of entries (symlinks, etc.)
    }

    // Return the folder with its items
    return {
      folderName,
      items
    };
  } catch (error) {
    throw new Error(`Error processing directory '${folderPath}': ${(error as Error).message}`);
  }
}

/**
 * Saves the template structure to a JSON file
 * 
 * @param templatePath - Path to the template directory
 * @param outputPath - Path where the JSON file should be saved
 * @param options - Scanning options
 * @returns Promise resolving when the file has been written
 */
export async function saveTemplateStructureToJson(
  templatePath: string, 
  outputPath: string,
  options?: ScanOptions
): Promise<void> {
  try {
    // Scan the template directory
    const templateStructure = await scanTemplateDirectory(templatePath, options);
    
    // Ensure the output directory exists
    const outputDir = path.dirname(outputPath);
    await fs.promises.mkdir(outputDir, { recursive: true });
    
    // Write the JSON file
    const data = await fs.promises.writeFile(
      outputPath, 
      JSON.stringify(templateStructure, null, 2),
      'utf8'
    );
    console.log(`Template structure saved to ${outputPath}`);


    
  } catch (error) {
    throw new Error(`Error saving template structure: ${(error as Error).message}`);
  }
}

export async function readTemplateStructureFromJson(filePath: string): Promise<TemplateFolder> {
  try {
    const data = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(data) as TemplateFolder;
  } catch (error) {
    throw new Error(`Error reading template structure: ${(error as Error).message}`);
  }
}

/**
 * Example usage:
 * 
 * // Basic usage with default options
 * const templateStructure = await scanTemplateDirectory('./templates/react-app');
 * 
 * // With custom options
 * const customOptions = {
 *   ignoreFiles: ['README.md', 'CHANGELOG.md'],
 *   ignoreFolders: ['docs', 'examples'],
 *   maxFileSize: 500 * 1024 // 500KB
 * };
 * const templateStructure = await scanTemplateDirectory('./templates/react-app', customOptions);
 * 
 * // Saving directly to a JSON file with custom options
 * await saveTemplateStructureToJson(
 *   './templates/react-app', 
 *   './output/react-app-template.json',
 *   customOptions
 * );
 */