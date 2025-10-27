"use client"
import React from 'react'
import { FileDialogProps } from '../../types/types'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Code2, Edit, FilePlus, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import GradientButton from '@/components/Custombuttons/GradientButton';

const NewFileDialog: React.FC<FileDialogProps> = ({
    isOpen, 
    onClose,
    onCreateFile,
    
}) => {
    const [filename, setFilename] = React.useState("");
    const [extension, setExtension] = React.useState("js");
    const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (filename.trim()) {
      onCreateFile(filename.trim(), extension.trim() || "js");
      setFilename("");
      setExtension("js");
    }
  };
     return (
        <Dialog open={isOpen} onOpenChange={onClose} >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                       <div className='flex items-center font-mono gap-2'>
                        <Plus className='size-4' />
                        <span>New File</span>
                       </div>
                    </DialogTitle>
 
                    <DialogDescription className='font-mono'>
                       Enter a file name and set an extension
                    </DialogDescription>
                </DialogHeader>


                 <form className="mt-5 mb-5" onSubmit={handleSubmit} >
                    <div className="relative flex-1 flex flex-col gap-2">  
  {/* Label */}
  <label 

    className="text-xs font-mono font-bold "
  >
     New File
  </label>

  {/* Input Wrapper */}
  <div className="relative">
   
    <div className="absolute left-4 top-1/2 -translate-y-1/2 ">
      <FilePlus className="size-4" />
    </div>

    {/* Input Field */}
    <Input
      id="rename-foldername"
      value={filename}
      onChange={(e) => setFilename(e.target.value)}
      className="pl-12 py-6 w-full rounded-lg border placeholder:font-mono text-xs"
      placeholder="Rename your folder"
    />
  </div>
</div>
<div className="relative flex-1 flex flex-col mt-5 gap-2">  
  {/* Label */}
  <label 

    className="text-xs font-mono font-bold "
  >
      Extension
  </label>

  {/* Input Wrapper */}
  <div className="relative">
   
    <div className="absolute left-4 top-1/2 -translate-y-1/2 ">
      <Code2 className="size-4" />
    </div>

    {/* Input Field */}
    <Input
      id="rename-foldername"
      value={extension}
      onChange={(e) => setExtension(e.target.value)}
      className="pl-12 py-6 w-full rounded-lg border placeholder:font-mono text-xs"
      placeholder="Rename your folder"
    />
  </div>
</div>

 <DialogFooter className='mt-5'>
                    <div className='w-full flex justify-between items-center'>
                       <Button onClick={onClose} className='text-white font-mono bg-red-600 hover:bg-red-800 rounded-none'>
                        Cancel
                       </Button>

                       <GradientButton type='submit' >
                         Create
                       </GradientButton>
                    </div>

                 </DialogFooter>
                 </form>

                
            </DialogContent>

        </Dialog>
     )
}

export default NewFileDialog