import { inngest } from '@/inngest/client'
import prisma from '@/lib/db'
import {protechedRoute, createTRPCRouter} from '@/trpc/init'
import z from 'zod'
import { generateSlug } from 'random-word-slugs'
import { TRPCError } from '@trpc/server'
import { consumeCredits } from '@/lib/usage'
export const projectRouter = createTRPCRouter({
    getOne: protechedRoute
    .input(z.object({
         id: z.string()
         .min(1,{message: "ID is required"})
    }))
    .query(
        async({input,ctx}) => {
           
            const existingProject = await prisma.project.findUnique({
                 where: {
                     id: input.id,
                     userId: ctx.auth.userId
                 }
            })
            if(!existingProject) {
                 throw new TRPCError({code: "NOT_FOUND",message: "project not found"})
            }
            return existingProject
        }
    ),
    getMany: protechedRoute
     .query(
        async({ctx}) => {
             const projects = await prisma.project.findMany({
                where: {
                   userId: ctx.auth.userId
                },
                 orderBy: {
                     updatedAt: 'desc'
                 }
             })
             return projects
        }),
     create: protechedRoute
      .input(
         z.object({
             prompt: z.string()
             .min(1, {message: "Message is Required"})
             .max(10000,{message: "Value is too long"})
         })
      )
      .mutation(async ({input,ctx}) => {
           try {
          await consumeCredits();
        } catch (error) {
          if (error instanceof Error) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "You are ran out of credits" });
          } else {
            throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "You are ran out of credits" });
          }
        }

       const createProject = await prisma.project.create({
          data: {
            userId: ctx.auth.userId,
             name: generateSlug(2,{
                format: "kebab"
             }),
             messages: {
                 create:{ 
                    content: input.prompt,
                    role: "USER",
                    type: "RESULT"
                 }
             }
          }
       })

          await inngest.send({
             name: "app/message.created",
             data:{
                 prompt: input.prompt,
                 projectId: createProject.id
             }
          })

          return createProject
      })
})