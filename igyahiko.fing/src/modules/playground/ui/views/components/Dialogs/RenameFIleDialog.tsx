import GradientButton from "@/components/Custombuttons/GradientButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RenameFildDialogProps } from "../../types/types";
import React from "react";
import { Edit, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";

 const RenameFileDialog = ({
    currentExtension,
    currentFileName,
    isOpen,
    onClose,
    onRename
}: RenameFildDialogProps) => {
     const [filename, setFilename] = React.useState(currentFileName);
     const [extension, setExtension] = React.useState(currentExtension);
      React.useEffect(() => {
    if (isOpen) {
      setFilename(currentFileName);
      setExtension(currentExtension)
    }
  }, [isOpen, currentExtension,currentFileName]);
    const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (filename.trim()) {
      onRename(filename.trim(), extension.trim() || currentExtension);
    }
  };
  
     return (
         <Dialog open={isOpen} onOpenChange={onClose} >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="font-mono text-xl">
                        Rename Folder
                    </DialogTitle>
                    <DialogDescription className="font-mono">
                        Enter a name to rename your folder
                    </DialogDescription>
                </DialogHeader>
                <form className="mt-5 mb-5" onSubmit={handleSubmit} >
      <div className="relative flex-1 flex flex-col gap-2">  
            <label htmlFor="rename-filename" className="text-xs font-mono font-bold">
              File Name
            </label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2">
                <FileText className="size-4" />
              </div>
              <Input
                id="rename-filename"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="pl-12 py-6 w-full rounded-lg border placeholder:font-mono text-xs"
                placeholder="Enter file name"
                autoFocus
              />
            </div>
          </div>

    <div className="relative flex-1 flex flex-col gap-2 mt-4">  
            <label htmlFor="rename-extension" className="text-xs font-mono font-bold">
              Extension
            </label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2">
                <Edit className="size-4" />
              </div>
              <Input
                id="rename-extension"
                value={extension}
                onChange={(e) => setExtension(e.target.value)}
                className="pl-12 py-6 w-full rounded-lg border placeholder:font-mono text-xs"
                placeholder="Enter file extension (e.g., js, tsx, css)"
              />
            </div>
          </div>

 <DialogFooter className="mt-5">
                    <div className='w-full flex justify-between items-center'>
                       <Button onClick={onClose} className='text-white font-mono bg-red-600 hover:bg-red-800 rounded-none'>
                        Cancel
                       </Button>

                       <GradientButton
                        type="submit"
                        ondisable={!filename.trim()}
                       >
                         Rename
                       </GradientButton>
                    </div>

                 </DialogFooter>
                 </form>

                
            </DialogContent>
         </Dialog>
     )
}

export default RenameFileDialog