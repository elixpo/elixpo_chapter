import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getMoodBoardImages =  query({
     args: {projectId: v.id('projects')},
     handler: async(ctx,{projectId}) => {
         const userId = await getAuthUserId(ctx);
         if(!userId) {
            return [];
         }
         const project = await ctx.db.get(projectId);
         if(!project || project.userId !== userId) {
             return []
         }
         const storageIds = project.moodBoardImages || [];
         const images = await Promise.all(
             storageIds.map(async (storageId,index) => {
                 try {
                   const url = await ctx.storage.getUrl(storageId)
                   return {
                     id: `convex-${storageId}`,
                     storageId,
                     url,
                     uploaded: true,
                     uploading: false,
                     index
                   }
                 } catch (error) {
                   return null
                 }
             })
         )
         return images
         .filter((image) =>  image !== null)
         .sort((a,b)=> a!.index -  b!.index)
     }
})


export const generatedUploadedUrl = mutation({
    handler: async(ctx) => {
        const userId = await getAuthUserId(ctx);
        if(!userId) throw new Error("Not authenticated");

        return await ctx.storage.generateUploadUrl()
    }
})

export const removeMoodBoardImage = mutation({
    args: {
        projectId: v.id('projects'),
        storageId: v.id('_storage')
    },
    handler: async (ctx,{projectId,storageId}) => {
         const userId = await getAuthUserId(ctx);
         if(!userId) throw new Error("not authenticated");

         const project = await ctx.db.get(projectId);
         if(!project) {
             throw new Error("projcet not found")
         }
         if(project.userId !== userId) {
             throw new Error("access denial")
         }
       const currentImages = project.moodBoardImages || null
       const updateImages = currentImages?.filter((id) => id !== storageId)

       await ctx.db.patch(projectId,{
           moodBoardImages: updateImages,
           lastModified: Date.now()
       })

       try {
         await ctx.storage.delete(storageId)
       } catch (error) {
         console.error(
            `failed to delete moodboard image ${storageId}`,
            error
         )
       }
    }  
})


export const addMoodBoardImage = mutation({
     args: {
        projectId: v.id('projects'),
        storageId: v.id('_storage')
    },
    handler: async(ctx,{projectId,storageId}) => {
       const userId = await getAuthUserId(ctx)
       if(!userId) throw new Error("Not authenticated");


       const project = await ctx.db.get(projectId)
       if(project?.userId !== userId) {
         throw new Error("not autheticated")
       }

       const currentImage = project.moodBoardImages || []
       if(currentImage.length >= 6) {
         throw new Error("Maxium 5 images are allowed at a time")
       }
       const updatedImage = [...currentImage, storageId]
       await ctx.db.patch(projectId,{
        moodBoardImages: updatedImage,
        lastModified: Date.now( )
       })
       return {
        success: true,
        imageCount: updatedImage.length
       }
    }
})