'use client'

import { generateGradientThumbnail } from "@/lib/generateGradientThumbnail";
import { createProjectStart,addProject, createProjectSuccess, createProjectFailure } from "@/redux/slices/project";
import { useAppDispatch, useAppSelector } from "@/redux/store"
import { fetchMutation } from "convex/nextjs";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

export const UseProjectCreation = () => {
    const dispatch = useAppDispatch();
    const user = useAppSelector((state) => state.profile)
    const projectState = useAppSelector((state) => state.projects);
    const shapeState = useAppSelector((state) => state.shapes)

     const createProject = async (name?:string) => {
         if(!user?.id) {
             toast.error('Please Sign-in to create project')
             return
         } 
         dispatch(createProjectStart())
         try {
           const thumbnail = generateGradientThumbnail();
           const result = await fetchMutation(api.projects.createProject,{
             userId: user.id as Id<'users'>,
             name: name || "vision",
             sketchesData: {
                shapes: shapeState.shapes,
                tool: shapeState.tool,
                selected: shapeState.selected,
                frameCounter: shapeState.frameCounter
             },
              thumbnail
           })
           dispatch(addProject({
             _id: result.projectId,
             name: result.name,
             projectNumber: result.projectNumber,
             thumbnail,
             lastModified: Date.now(),
             createdAt: Date.now(),
             isPublic: false 
           }))
           dispatch(createProjectSuccess())
           toast.success("Project Created Successfully")
         } catch (error) {
           dispatch(createProjectFailure("Failed to create Project"))
           toast.error("failed to create projectss")
         }
     }
    /* const isCreating = async () => {
         
    }
    const canCreate = async () => { 
      
        
    } */

    return {
       createProject,
       isCreating: projectState.isCreating,
       projects: projectState.projects,
       projectTotal: projectState.total,
       canCreate: !!user?.id
    }
}