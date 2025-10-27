import GradientButton from "@/components/Custombuttons/GradientButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RenameFolderDialogProps } from "../../types/types";
import React from "react";
import { Edit } from "lucide-react";
import { Input } from "@/components/ui/input";

export const RenameFolderDialog = ({
    currentFolderName,
    isOpen,
    onClose,
    onRename
}: RenameFolderDialogProps) => {
     const [folderName, setFolderName] = React.useState(currentFolderName);
      React.useEffect(() => {
    if (isOpen) {
      setFolderName(currentFolderName);
    }
  }, [isOpen, currentFolderName]);
    const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (folderName.trim()) {
      onRename(folderName.trim());
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
  {/* Label */}
  <label 

    className="text-xs font-mono font-bold "
  >
     Rename Foler
  </label>

  {/* Input Wrapper */}
  <div className="relative">
   
    <div className="absolute left-4 top-1/2 -translate-y-1/2 ">
      <Edit className="size-4" />
    </div>

    {/* Input Field */}
    <Input
      id="rename-foldername"
      value={folderName}
      onChange={(e) => setFolderName(e.target.value)}
      className="pl-12 py-6 w-full rounded-lg border placeholder:font-mono text-xs"
      placeholder="Rename your folder"
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