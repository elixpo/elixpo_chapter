import React, { FormEvent } from 'react'
import { FolderDialogProps } from '../../types/types'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FolderPlus, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import GradientButton from '@/components/Custombuttons/GradientButton';

const NewFolderDialog: React.FC<FolderDialogProps> = ({
    isOpen,
    onClose,
    onCreateFolder
}) => {
  const [foldername, setFoldername] = React.useState("");
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if(foldername.trim()) {
       onCreateFolder(foldername.trim());
       setFoldername("");
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

    className="text-xs font-mono font-bold  "
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
      value={foldername}
      onChange={(e) => setFoldername(e.target.value)}
      className="pl-12 py-6 w-full rounded-lg border placeholder:font-mono text-xs"
      placeholder="Create Folder"
    />
  </div>
</div>

 <DialogFooter className='mt-5'>
                <div className="flex w-full mt-2 justify-between items-center" >
                    <Button onClick={onClose} className="bg-red-600 hover:bg-red-700 rounded-none text-white font-mono">
                        Cancel
                    </Button>

                    <GradientButton type='submit'>
                        Create Folder 
                    </GradientButton>
                </div>
            </DialogFooter>
                 </form>
                 
            </DialogContent>

           
        </Dialog>
  )
}

export default NewFolderDialog