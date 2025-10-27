"use client"
import React, {  useState } from 'react'
import { EditProjectProps, PlayGroundProjects, PlayGroundTableTypesProps } from '../types/types'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { format } from "date-fns";

import { Button } from '@/components/ui/button'
import {  Code2, Copy, Download, Edit, Edit3, ExternalLink, Eye, MoreHorizontal, Trash2 } from 'lucide-react'
import { useUser } from '@clerk/nextjs'
import UserControl from '@/components/user-control'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import GradientButton from '@/components/Custombuttons/GradientButton'
import { toast } from 'sonner'
import { AlertDialog, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { AlertDescription } from '@/components/ui/alert'
import HeaderLoader from '@/components/loader/HeaderLoader'
const ProjectTable = ({
    projects=[],
    onDelete,
    onDuplicate,
    onUpdate
}: PlayGroundTableTypesProps) => {
    const {user} = useUser();
    const [deleteDialogOpen,setDeleteDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [seletedProject, setSelectedProject] = useState<PlayGroundProjects | null>(null);
    const [editData,setEditData] = useState<EditProjectProps>({title: " ", describtion: " "});
    const [isLoading, setIsLoading] = useState(false);
   /*  const [favorite, setFavorite] = useState(false); */

   const copyProjectUrl = async (projectId: string) => {
     const url = `${window.location.origin}/playground/${projectId}`
     navigator.clipboard.writeText(url);
     toast.success("Copy Url Successfully")
   } 

 const handleSaveEdit = async () => {
  if (!seletedProject || !onUpdate) return;
  
  try {
    setIsLoading(true);
    await onUpdate({
      ...seletedProject,
      title: editData.title,
      describtion: editData.describtion
    });
    setEditDialogOpen(false);
    toast.success("Project updated successfully");
  } catch (error) {
    toast.error("Failed to update project");
    console.error(error);
  } finally {
    setIsLoading(false);
  }
};

  // Function to update editData fields
 const handleEditData = (project: PlayGroundProjects) => {
  setSelectedProject(project);
  setEditData({
    title: project.title,
    describtion: project.describtion || ""
  });
  setEditDialogOpen(true);
};

// Update the input change handlers
const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  setEditData(prev => ({ ...prev, title: e.target.value }));
};

const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
  setEditData(prev => ({ ...prev, describtion: e.target.value }));
};

   const handleDuplicateProject = async (project: PlayGroundProjects) => {
       if(onDuplicate) {
          onDuplicate(project)
       }
   }
    
   const DeleteModal = (project:PlayGroundProjects) => {
     setSelectedProject(project)
     setDeleteDialogOpen(true)
   }
  const handleDeleteClick = async () => {
  if (seletedProject && onDelete) {
    onDelete(seletedProject.id);
    setDeleteDialogOpen(false);
  }
};

/* 
  const frameworkColors = {
  react: "bg-blue-500 text-white", 
  nextjs: "bg-gray-900 text-white",
  vue: "bg-green-500 text-white",
  angular: "bg-red-600 text-white",
  svelte: "bg-orange-500 text-white",
  default: "bg-pink-600 text-white" // fallback
}; */

 {
   if(isLoading) {
     return (
      <HeaderLoader/>
     )
   } else {
     return (
    <>
   
   <div className='flex flex-col md:w-full gap-2'>
    <h1 style={{fontFamily: "poppins"}} className='text-2xl mb-2 flex items-center gap-2 font-bold'>Recent <span className='text-neutral-500'>Projects</span> 
        <Code2/>
         </h1>
     <div className='border w-full  rounded-md overflow-hidden'>
     <Table >
        <TableHeader>
            <TableRow>
                <TableHead>Projects</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>User</TableHead>
                <TableHead className='w-[50px]'>Actions</TableHead>
            </TableRow>
        </TableHeader>

    
      <TableBody  >
            {
                projects.map((project) => (
                    <TableRow key={project.id} >
                       <TableCell>
                         <div className='flex flex-col'>
                         <Link href={`/playground/${project.id}`} >
                          <div >
                             <span className='font-mono text-xs'>{project.title}</span>
                             <p className='text-xs  mt-1 opacity-80' >{project.describtion}</p>
                          </div>
                         </Link>
                        </div>
                       </TableCell>

                       <TableCell>
                       <Badge
                       
                       variant={"outline"} className='bg-pink-800 text-white' >
                        {project.template}
                       </Badge>
                       </TableCell>

                      <TableCell>
                       {project.createdAt
                       ? format(new Date(project.createdAt), "dd MMM yyyy")
                      : "—"}
                      </TableCell>

                     <TableCell>
                       <div className='flex items-center gap-1 justify-start'>
                       <UserControl/>
                        <span>{user?.firstName}&apos;s playground</span>
                       </div>
                     </TableCell>

                      <TableCell  >
                        <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52  flex flex-col space-y-3 font-mono dark:bg-neutral-950 p-4 rounded-md">
                      <DropdownMenuItem asChild>
                        {/* <MarkedToggleButton
                          markedForRevision={project.Starmark[0]?.isMarked}
                          id={project.id}
                        /> */}
                      </DropdownMenuItem>
                      <DropdownMenuItem   asChild>
                        <Link
                          href={`/playground/${project.id}`}
                          className="flex items-center"
                        >
                          <span className='flex items-center gap-1'>
                         <Eye className="h-4 w-4 mr-2" />
                          Open Project
                          </span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem className='' asChild>
                        <Link
                          href={`/playground/${project.id}`}
                          target="_blank"
                          className="flex items-center"
                        >
                         <span className='flex items-center gap-1'>
                         <ExternalLink className="h-4 w-4 mr-2" />
                          Open in New Tab
                         </span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleEditData(project)}
                      >
                       <span className='flex items-center gap-1'>
                         <Edit3 className="h-4 w-4 mr-2" />
                        Edit Project
                       </span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDuplicateProject(project)}
                      >
                        <span className='flex items-center gap-1'>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicate
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => copyProjectUrl(project.id)}
                      >
                       <span className='flex gap-1 items-center'>
                         <Download className="h-4 w-4 mr-2" />
                        Copy URL 
                       </span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => DeleteModal(project)}
                        className="text-destructive focus:text-destructive"
                      >
                       <span className='flex items-center gap-1'>
                         <Trash2 className="h-4 w-4 mr-2" />
                        Delete Project
                       </span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                      </TableCell>

                      
                    </TableRow>
                ))
            }
        </TableBody>
     </Table>
    </div>
    </div>

    <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen} >
      <DialogContent className='sm:max-w-[600px] ' >
        <DialogHeader>
           <DialogTitle>
            <div className='flex items-center gap-2'>
              <Edit className='size-5' />
              <span className='text-xl font-mono'>Edit Playground</span>
            </div>
           </DialogTitle>
           <DialogDescription>
            Make changes to your project details here. click save when you are done.
           </DialogDescription>
        </DialogHeader>
        <div className='grid gap-2'>
             <div className="relative flex-1 flex flex-col gap-2">
  {/* Label */}
  <label 
    htmlFor="projectName" 
    className="text-xs font-mono font-bold  "
  >
    Project Name
  </label>

  {/* Input Wrapper */}
  <div className="relative">
    {/* Search Icon */}
    <div className="absolute left-4 top-1/2 -translate-y-1/2 ">
      <Code2 size={20} />
    </div>

    {/* Input Field */}
    <Input
      id="projectName"
      value={editData.title}
      onChange={handleTitleChange}
      className="pl-12 py-6 w-full rounded-lg border placeholder:font-mono text-xs"
      placeholder="Set a Project name"
    />
  </div>
</div>
 <div className="relative flex-1 mt-4 mb-2 flex flex-col gap-2">
  {/* Label */}
  <label 
    htmlFor="projectName" 
    className="text-xs font-mono font-bold  "
  >
    Project Describtion
  </label>

  {/* Input Wrapper */}
  
  <div className="relative shadow-[0_0_0_1px_#FF4F7D,0_8px_20px_rgba(255,79,125,0.15)] rounded-lg">
    {/* Search Icon */}

    {/* Input Field */}
    <Textarea
      id="projectDescribtion"
      value={editData.describtion}
      onChange={handleDescriptionChange}
      className="pl-12 py-6 w-full rounded-lg border placeholder:font-mono text-xs"
      placeholder="Project Describtion"
      rows={3}
    />
  </div>
</div>
        </div>
   
        <DialogFooter>
            <div className='flex gap-3 justify-between items-center w-full'>
                <Button 
                 onClick={() => setEditDialogOpen(false)}
                className='rounded-none bg-red-600 hover:bg-red-700 text-white font-mono'  >Cancel</Button>
                <GradientButton
                 onClick={handleSaveEdit}
                >
                    save
                </GradientButton>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} >
      <AlertDialogContent>
        <AlertDialogHeader>
            <AlertDialogTitle>
                <div className='flex items-center gap-2'>
                    <Trash2 className='size-5' />
                    <span className='text-2xl font-mono text-red-400 '>Delete the project</span>
                </div>
            </AlertDialogTitle>
            <AlertDescription className='text-xs flex font-mono font-medium'>
                Are you sure you want to delete <span className='text-pink-500'>{seletedProject?.title}</span> project
            </AlertDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
            <div className='flex items-center w-full justify-start gap-4'>
             <Button onClick={() => setDeleteDialogOpen(false)} className='font-mono text-white rounded-none bg-red-600 hover:bg-red-700'>
                Cancel
             </Button>

             <GradientButton
             onClick={handleDeleteClick}
             >
                Delete
             </GradientButton>
            </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
   }
 }
  
}

export default ProjectTable