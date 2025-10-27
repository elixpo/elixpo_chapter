
export interface TemplateFile {
  filename: string;
  fileExtension: string;
  content: string;
}
export interface PlaygroundData {
  id: string;
  title?: string;
  [key: string]: any;
}

export interface TemplateFolder {
  folderName: string;
  items: (TemplateFile | TemplateFolder)[];
}

export interface LoadingStepProps {
  currentStep: number;
  step: number;
  label: string;
}

export interface OpenFile extends TemplateFile {
  id: string;
  hasUnsavedChanges: boolean;
  content: string;
  originalContent: string;
}
