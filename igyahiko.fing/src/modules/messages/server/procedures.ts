import { inngest } from '@/inngest/client'
import prisma from '@/lib/db'
import { consumeCredits } from '@/lib/usage'
import {protechedRoute, createTRPCRouter} from '@/trpc/init'
import { TRPCError } from '@trpc/server'
/* import { userAgent } from 'next/server' */
import z from 'zod'

export const messageRouter = createTRPCRouter({
    getMany: protechedRoute
    .input(
         z.object({
             projectId: z.string()
             .min(1, {message: "ProjectID is required"})
             
         })
      )
     .query(
        async({input,ctx}) => {
            
             const message = await prisma.message.findMany({
                where: {
                    projectId: input.projectId,
                    project: {
                        userId: ctx.auth.userId
                    }
                },
                include:{
                    fragment: true
                },
                 orderBy: {
                     updatedAt: 'asc'
                 }
             })
             return message
        }),
     create: protechedRoute
      .input(
         z.object({
             prompt: z.string()
             .min(1, {message: "Message is Required"})
             .max(10000, {message: "Value is too long"}),
             projectId: z.string()
             .min(1, {message: "ProjectID is required"}),
             selectedModel: z.string().optional()
             
         })
      )
      .mutation(async ({input,ctx}) => {
       const existingProject = await prisma.project.findUnique({ 
           where: {
              id: input.projectId,
              userId: ctx.auth.userId 
           }
       })

       if(!existingProject) {
         throw new TRPCError({code: "NOT_FOUND", message: "Project not found "})
       }
 
       try {
  await consumeCredits();
} catch (error) {
  if (error instanceof Error) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "You are ran out of credits" });
  } else {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "You are ran out of credits" });
  }
}


       const createdMsg = await prisma.message.create({
             data: {
                 projectId: existingProject.id,
                  content: input.prompt,
                  role: "USER",
                  type: "RESULT"
                  
             }
          })
          await inngest.send({
             name: "app/message.created",
             data:{
                 prompt: input.prompt,
                 projectId: input.projectId,
                 selectedModel: input.selectedModel ?? "openAI-GPT-4.1",
             }
          })

          return createdMsg
      })
})