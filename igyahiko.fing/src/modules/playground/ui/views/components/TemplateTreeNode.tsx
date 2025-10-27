'use client'
import React, { useState } from 'react'
import { TemplateFolder, TemplateFile, TemplateTreeNodeProps } from '../types/types'
import { Folder, File, MoreHorizontal, Trash2, ChevronRight, FilePlus, FolderPlus, Edit3 } from 'lucide-react'
import { SidebarMenuButton, SidebarMenuItem, SidebarMenuSub } from '@/components/ui/sidebar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleTrigger } from '@/components/ui/collapsible'
import { CollapsibleContent } from '@radix-ui/react-collapsible'
import { RenameFolderDialog } from './Dialogs/RenameFolderDialog'
import NewFileDialog from './Dialogs/NewFileDialog'
import NewFolderDialog from './Dialogs/NewFolderDialog'
import RenameFileDialog from './Dialogs/RenameFIleDialog'



const TemplateTreeNode: React.FC<TemplateTreeNodeProps> = ({
  item,
  level = 0,
  path = '',
  selectedFiles,
  onFileSelect,
  onAddFile,
  onAddFolder,
  onDeleteFile,
  onDeleteFolder,
  onRenameFile,
  onRenameFolder
}) => {

  const isValidItem = item && typeof item === 'object'
  const isFolder = isValidItem && "folderName" in item

  const [isOpen, setIsOpen] = useState<boolean>(level < 2) // open first few levels
  const [isNewFileDialogOpen, setIsNewFileDialogOpen] = React.useState(false)
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = React.useState(false);
  const [isRenameFolderDialogOpen,setIsRenameFolderDialogOpen] = React.useState(false)
  const [isRenameFileDialog, setIsRenameFileDialog] = React.useState(false);
  

  /* const handleRenameSubmit = () => {

  } */

  const openRenameFolderDialog = () => {
     setIsRenameFolderDialogOpen(true)
  }

  const openRenameFileDialog = () => {
      setIsRenameFileDialog(true)
  }
   if (!isValidItem) return null

  if (!isFolder) {
  const file = item as TemplateFile;
  const fileName = `${file.filename}.${file.fileExtension}`;
  const isSelected = selectedFiles && selectedFiles.filename === file.filename && selectedFiles.fileExtension === file.fileExtension;
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(fileName);

   const handleRenameSubmit = () => {
    if (newName.trim() && newName !== fileName) {
      const [filename, ...extParts] = newName.split('.');
      const fileExtension = extParts.join('.');
      onRenameFile?.(file, filename, fileExtension, path);
    }
    setIsRenaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setIsRenaming(false);
      setNewName(fileName);
    }
  };

  
const handleDelete = () => {
   onDeleteFile?.(file, path)
   
}

const handleRenameFile = (
  newFileName: string,
  newFileExtension: string,
) => {
   onRenameFile?.(file,newFileName,newFileExtension ,path)
   setIsNewFileDialogOpen(false)
}
  return (
    <SidebarMenuItem>
      <div className="flex items-center group">
        <>
            <SidebarMenuButton 
              isActive={isSelected} 
              onClick={() => onFileSelect?.(file)} 
              className="flex-1"
            >
              <File className="h-4 w-4 mr-2 shrink-0" />
              <span>{fileName}</span>
            </SidebarMenuButton>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                 onClick={openRenameFileDialog}
                >
                  <Edit3 className="h-4 w-4 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
      </div>

      <RenameFileDialog
       isOpen={isRenameFileDialog}
       currentFileName={file.filename}
       currentExtension={file.fileExtension}
       onClose={() => setIsRenameFileDialog(false)}
       onRename={handleRenameFile}
      />
    </SidebarMenuItem>
  );
} else {
    const folder = item as TemplateFolder
    const folderName = folder.folderName
    const currentPath = path ? `${path}/${folderName}` : folderName
    const handleDeleteFolder = () => {
       onDeleteFolder?.(folder, path)

    }
    const createFile = (filename: string, extension: string) => {
       if(onAddFile) {
         const newFile: TemplateFile = {
            filename,
            fileExtension: extension,
            content: ""
         }
          onAddFile(newFile, currentPath)
       }
       setIsNewFileDialogOpen(false)
    }
     const handleCreateFolder = (folder: string) => {
      if (onAddFolder) {
        const newFolder: TemplateFolder = {
          folderName: folder,
          items: [],
        };
        onAddFolder(newFolder, currentPath);
      }
      setIsNewFolderDialogOpen(false); // Close the NEW folder dialog
    }

    const handelOnRename = (newFoldername: string) => {
       onRenameFolder?.(folder,newFoldername, path);
       setIsNewFolderDialogOpen(false)
    }   
    return (
     <div>


         <SidebarMenuItem>
        <Collapsible
          open={isOpen}
          onOpenChange={setIsOpen}
          className="group/collapsible [&[data-state=open]>div>button>svg:first-child]:rotate-90"
        >
          <div className="flex items-center group">
            <CollapsibleTrigger asChild>
              <SidebarMenuButton className="flex-1">
                <ChevronRight className="transition-transform" />
                <Folder className="h-4 w-4 mr-2 shrink-0 text-pink-800" />
                <span>{folderName}</span>
              </SidebarMenuButton>
            </CollapsibleTrigger>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsNewFileDialogOpen(true)} >
                  <FilePlus className="h-4 w-4 mr-2" />
                  New File
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsNewFolderDialogOpen(true)} >
                  <FolderPlus className="h-4 w-4 mr-2" />
                  New Folder
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={openRenameFolderDialog} >
                  <Edit3 className="h-4 w-4 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                 onClick={handleDeleteFolder}
                 className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <CollapsibleContent>
            <SidebarMenuSub>
              {folder.items.map((childItem, index) => (
                <TemplateTreeNode
                  key={index}
                  item={childItem}
                  onFileSelect={onFileSelect}
                  selectedFiles={selectedFiles}
                  level={level + 1}
                  path={currentPath}
                  onAddFile={onAddFile}
                  onAddFolder={onAddFolder}
                  onDeleteFile={onDeleteFile}
                  onDeleteFolder={onDeleteFolder}
                  onRenameFile={onRenameFile}
                  onRenameFolder={onRenameFolder}
                />
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        </Collapsible>

       

       

     
      </SidebarMenuItem>

     
           
          <RenameFolderDialog
          isOpen={isRenameFolderDialogOpen}
          currentFolderName={folder.folderName}
          onClose={() => setIsRenameFolderDialogOpen(false)}
          onRename={handelOnRename}
         
         />
           

        <NewFileDialog
         isOpen={isNewFileDialogOpen}
         onClose={() => setIsNewFileDialogOpen(false)}
         onCreateFile={createFile}
        />

        <NewFolderDialog
          isOpen={isNewFolderDialogOpen}
          onClose={() => setIsNewFolderDialogOpen(false)}
          onCreateFolder={handleCreateFolder}
        />
     </div>
    )
}
  }



export default TemplateTreeNode






