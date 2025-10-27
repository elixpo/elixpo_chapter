'use client'
import React from "react";
import { FileDialogProps, FolderDialogProps, TemplateFile, TemplateFileTreeProps, TemplateFolder } from "../types/types";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {  CodeXml, FilePlus2, FolderPlus, Plus } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import GradientButton from "@/components/Custombuttons/GradientButton";
import TemplateTreeNode from "./TemplateTreeNode";
import { toast } from "sonner";

  const TemplateTree = ({
  data,
  onAddFile,
  onAddFolder,
  onDeleteFile,
  onDeleteFolder,
  onFileSelect,
  onRenameFile,
  onRenameFolder,
  selectedFile,
  title,
}: TemplateFileTreeProps) => {
    const isRootFolder = data && typeof data === "object" && "folderName" in data
    const [isNewFileDialogOpen, setIsNewFileDialogOpen] = React.useState(false);
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = React.useState(false);
 const openNewFolderDialog = () => {
      setIsNewFolderDialogOpen(true); // Open the NEW folder dialog
    }
  const handelNewFileDialog = () => {
     setIsNewFileDialogOpen(true)
  }
  const handleNewFolderDialog = () => {
     setIsNewFolderDialogOpen(true)
  }

    const handleCreateFile = (filename: string, extension: string) => {
    if (onAddFile && isRootFolder) {
      const newFile: TemplateFile = {
        filename,
        fileExtension: extension,
        content: "",
      };
      
      // For root folder, path should be empty string
      // If the TemplateFolder type has a path property, use it, otherwise use empty string
      const rootFolderPath = (data as any).path || "";
      onAddFile(newFile, rootFolderPath);
      
      toast.success(`File ${filename}.${extension} created successfully`);
    } else {
      toast.error("Cannot create file: No root folder found");
    }
    setIsNewFileDialogOpen(false);
  };


  const handleOnCreateFolder = (folderName: string) => {
     if(onAddFolder && isRootFolder) {
       const newFolder: TemplateFolder = {
          folderName,
          items:[]
       }
        onAddFolder(newFolder, "")
     }
      setIsNewFolderDialogOpen(false)
  }
  
  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          {title && (
            <SidebarGroupLabel className="font-mono text-xs">
              {title}
            </SidebarGroupLabel>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarGroupAction>
                <Plus  className="size-4" />
              </SidebarGroupAction>
            </DropdownMenuTrigger>

            <DropdownMenuContent className="font-mono" align="end">
              <DropdownMenuItem onClick={openNewFolderDialog}>
                <FolderPlus className="size-4" />
                New Folder
              </DropdownMenuItem>

              <DropdownMenuItem onClick={handelNewFileDialog}>
                <FilePlus2 className="size-4" />
                New File
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <SidebarGroupContent>
            {data && (
             
                <TemplateTreeNode
                  item={data}
                  level={0}
                  path=""
                  selectedFiles={selectedFile}
                  onFileSelect={onFileSelect}
                  onAddFile={onAddFile}
                  onAddFolder={onAddFolder}
                  onDeleteFile={onDeleteFile}
                  onDeleteFolder={onDeleteFolder}
                  onRenameFile={onRenameFile}
                  onRenameFolder={onRenameFolder}
                />
             
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail/>
      <NewFileDialog   onCreateFile={handleCreateFile} isOpen={isNewFileDialogOpen} onClose={() => setIsNewFileDialogOpen(false)} />

        <NewFolderDialog onCreateFolder={handleOnCreateFolder} isOpen={isNewFolderDialogOpen} onClose={() => setIsNewFolderDialogOpen(false)} />
    
    </Sidebar>
  );
};


export default TemplateTree








const NewFileDialog = ({isOpen,onClose,onCreateFile}: FileDialogProps) => {
    const [filename,setFilename] = React.useState("");
    const [extension,setExtension] = React.useState("js");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if(filename.trim()) {
             onCreateFile(filename.trim(), extension.trim() || 'js')
            setFilename("")
            setExtension("js")

        }
    }
     return (
        <Dialog open={isOpen} onOpenChange={onClose} > 
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="">
                       <div className="flex items-center font-mono gap-2">
                         <Plus className="size-5" />
                        Create New File
                       </div>
                    </DialogTitle>
                    <DialogDescription className="font-mono">
                        Enter a name for file and select a extension
                    </DialogDescription>
                </DialogHeader>

                 <form onSubmit={handleSubmit} >
                    <div className="relative flex-1 flex flex-col gap-2">  
  {/* Label */}
  <label 
    htmlFor="projectName" 
    className="text-xs font-mono font-bold ml-2 "
  >
    File Name
  </label>

  {/* Input Wrapper */}
  <div className="relative">
   
    <div className="absolute left-4 top-1/2 -translate-y-1/2 ">
      <FilePlus2 className="size-4" />
    </div>

    {/* Input Field */}
    <Input
      id="filename"
      value={filename}
      onChange={(e) => setFilename(e.target.value)}
      className="pl-12 py-6 w-full rounded-lg border placeholder:font-mono text-xs"
      placeholder="Create File"
    />
  </div>
</div>

<div className="relative flex-1 flex flex-col mt-5 gap-2">  
  {/* Label */}
  <label 
    htmlFor="projectName" 
    className="text-xs font-mono font-bold ml-2 "
  >
  Extension
  </label>

  {/* Input Wrapper */}
  <div className="relative">
   
    <div className="absolute left-4 top-1/2 -translate-y-1/2 ">
      <CodeXml className="size-4" />
    </div>

    {/* Input Field */}
    <Input
      id="extension"
      value={extension}
      onChange={(e) => setExtension(e.target.value)}
      className="pl-12 py-6 w-full rounded-lg border placeholder:font-mono text-xs"
      placeholder="Extension"
    />
  </div>
</div>
 <DialogFooter className="mt-5">
                <div className="flex w-full mt-2 justify-between items-center" >
                    <Button onClick={onClose} className="bg-red-600 hover:bg-red-700 rounded-none text-white font-mono">
                        Cancel
                    </Button>

                  <GradientButton
                      ondisable={!filename.trim()}
                      type="submit"
                     >
                        Create File 
                    </GradientButton>
                </div>
            </DialogFooter>
                 </form>
                 
            </DialogContent>

           
        </Dialog>
     )
}

const NewFolderDialog = ({isOpen,onClose,onCreateFolder}: FolderDialogProps) => {
     const [folderName, setFolderName] = React.useState("")

     const handleSubmit = (e: React.FormEvent) => {
       console.log("Helllo pressed")
       
         e.preventDefault()
         if(folderName.trim()) {
            onCreateFolder(folderName.trim())
            setFolderName("");
         }
     }

     return (
        <Dialog open={isOpen} onOpenChange={onClose} > 
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="">
                       <div className="flex items-center font-mono gap-2">
                         <Plus className="size-5" />
                        Create New Folder
                       </div>
                    </DialogTitle>
                    <DialogDescription className="font-mono">
                        Enter a name for your folder.
                    </DialogDescription>
                </DialogHeader>

                 <form onSubmit={handleSubmit} >
                    <div className="relative flex-1 flex flex-col gap-2">  
  {/* Label */}
  <label 

    className="text-xs font-mono font-bold ml-2 "
  >
    Foler Name
  </label>

  {/* Input Wrapper */}
  <div className="relative">
   
    <div className="absolute left-4 top-1/2 -translate-y-1/2 ">
      <FolderPlus className="size-4" />
    </div>

    {/* Input Field */}
    <Input
      id="folderName"
      value={folderName}
      onChange={(e) => setFolderName(e.target.value)}
      className="pl-12 py-6 w-full rounded-lg border placeholder:font-mono text-xs"
      placeholder="Create Folder"
    />
  </div>
</div>
 <DialogFooter className="mt-5">
                <div className="flex w-full mt-2 justify-between items-center" >
                    <Button onClick={onClose} className="bg-red-600 hover:bg-red-700 rounded-none text-white font-mono">
                        Cancel
                    </Button>

                    <GradientButton
                     type="submit" 
                      ondisable={!folderName.trim()}
                    >
                        Create Folder 
                    </GradientButton>
                </div>
            </DialogFooter> 

                 </form>
                 
            </DialogContent>

           
        </Dialog>
     )
}

