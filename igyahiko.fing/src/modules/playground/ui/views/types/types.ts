
export interface TemplateFile {
     filename: string;
     fileExtension: string;
     content: string
}

export interface TemplateFolder {
     folderName: string;
     items: (TemplateFile | TemplateFolder)[]
}

export type TemplateItem = TemplateFile | TemplateFolder

export interface TemplateFileTreeProps {
     data?: TemplateItem
     onFileSelect?: (file: TemplateFile) => void
     selectedFile?: TemplateFile
     title? : string
     onAddFile?: (file: TemplateFile,parentPath: string) => void
     onAddFolder?: (file: TemplateFolder, parentPath: string) => void
     onDeleteFile?: (file: TemplateFile, parentPath: string) => void
     onDeleteFolder?: (file: TemplateFolder, parentPath: string) => void
     onRenameFile?: (file: TemplateFile, newFileName: string, newExtension: string,parentPath: string) => void
     onRenameFolder?: (file: TemplateFolder, newFolderName: string, parentPath: string) => void
}

export interface TemplateTreeNodeProps {
     item?: TemplateItem,
     level?: number
     path?: string
     selectedFiles?: TemplateFile
     onFileSelect?: (file: TemplateFile) => void
     onAddFile?: (file: TemplateFile,parentPath: string) => void
     onAddFolder?: (file: TemplateFolder, parentPath: string) => void
     onDeleteFile?: (file: TemplateFile, parentPath: string) => void
     onDeleteFolder?: (file: TemplateFolder, parentPath: string) => void
     onRenameFile?: (
        file: TemplateFile,
        newFileName: string, 
        newExtension: string,
        parentPath: string
    ) => void
     onRenameFolder?: (
        file: TemplateFolder,
        newFolderName: string, 
        parentPath: string
    ) => void
}



//handle file folder dialogs interfaces 

export interface FileDialogProps {
     isOpen: boolean;
     onClose: () => void;
     onCreateFile: (filename:string, extension: string) => void
     
     
}

export interface FolderDialogProps {
     isOpen: boolean;
     onClose: () => void;
     onCreateFolder: (foldername:string) => void
}

export interface RenameFolderDialogProps {
     isOpen: boolean;
     onClose: () => void;
     onRename: (foldername: string) => void
     currentFolderName: string
}

export interface RenameFildDialogProps {
     isOpen: boolean;
     onClose: () => void;
     onRename: (filename: string, extension: string) => void
     currentFileName: string
     currentExtension: string

}

export interface PlaygroundCodeEditorProps {
     activeFile: TemplateFile | undefined;
     content: string;
     onContentChange: (value:string) => void;
     suggestion: string | null;
     suggestionLoading: boolean;
     suggestionPosition: {line: number, column: number} | null;
     onAcceptSuggestion: (editor: any, monaco: any) => void;
     onRejectSuggestion: (editor: any) => void
     onTriggerSuggestion: (type: string, editor: any) => void
     

}



                         