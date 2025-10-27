
import prisma from "@/lib/db";
import { createTRPCRouter, protechedRoute } from "@/trpc/init";
import { TRPCError } from "@trpc/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// Define your template enum as a constant to reuse
const TEMPLATES = ["REACT", "NEXTJS", "EXPRESS", "HONO", "ANGULAR", "VUE"] as const;
type Template = typeof TEMPLATES[number];

export const playGroundRouter = createTRPCRouter({
  // Create a new Playground
  createPlayground: protechedRoute.input(
      z.object({
        title: z.string().min(1, "Title is required"),
        description: z.string().optional(),
        template: z.enum(TEMPLATES).default("REACT"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await prisma.playground.create({
          data: {
            title: input.title,
            describtion: input.description, // Note: Fixing typo to match your schema
            template: input.template,
            userId: ctx.auth.userId,
          },
        });
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to create playground",
        });
      }
    }),

  // Get all playgrounds for the logged-in user with starred status
  getAllPlaygrounds: protechedRoute.query(async ({ ctx }) => {
    try {
      const playgrounds = await prisma.playground.findMany({
        where: { userId: ctx.auth.userId },
        include: {
          startMark: {
            where: { userId: ctx.auth.userId },
            select: { isMarked: true },
            orderBy: { createdAt: "desc" },
            take: 1, // Only get the most recent mark
          },
        },
        
        orderBy: { createdAt: "desc" },
      });

      // Transform the data to a more client-friendly format
      return playgrounds.map(playground => ({
        ...playground,
        isStarred: playground.startMark[0]?.isMarked ?? false,
      }));
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Failed to fetch playgrounds",
      });
    }
  }),

  // Additional useful procedures
  toggleStar: protechedRoute
    .input(z.object({ playgroundId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const existingMark = await prisma.startMark.findUnique({
          where: {
            userId_playgroundId: {
              userId: ctx.auth.userId,
              playgroundId: input.playgroundId,
            },
          },
        });

        if (existingMark) {
          return await prisma.startMark.update({
            where: { id: existingMark.id },
            data: { isMarked: !existingMark.isMarked },
          });
        }

        return await prisma.startMark.create({
          data: {
            userId: ctx.auth.userId,
            playgroundId: input.playgroundId,
            isMarked: true,
          },
        });
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to toggle star",
        });
      }
    }),

  // Get a single playground by ID
 getPlayground: protechedRoute
  .input(z.object({ id: z.string() }))
  .query(async ({ ctx, input }) => {
    const playground = await prisma.playground.findUnique({
      where: {
        id: input.id,
        userId: ctx.auth.userId, // Ensures user owns it
      },
      select: {
        id: true,
        title: true, // ✅ Added title
        describtion: true,
        template: true,
        createdAt: true,
        updatedAt: true,
        startMark: {
          where: { userId: ctx.auth.userId },
          select: { isMarked: true },
        },
        templateFiles: {
          select: { content: true },
        },
      },
    });

    if (!playground) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Playground not found or access denied",
      });
    }

    return playground;
  }),




    /* 🚀deleteProjectById */
    deleteProjectById: protechedRoute
  .input(
    z.object({
      id: z.string().min(1, { message: "Project ID is required" }),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.auth.userId;
    if (!userId) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "User not found",
      });
    }

    // Check if project exists and belongs to user
    const project = await prisma.playground.findUnique({
      where: { id: input.id },
    });

    if (!project || project.userId !== userId) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Project not found or you do not have permission",
      });
    }

    // Delete project
    await prisma.playground.delete({
      where: { id: input.id },
    });

    // Revalidate the dashboard page
    revalidatePath("/dashboard");

    return { success: true };
  }),
/* 🚀editProjectById */

editProjectById: protechedRoute
  .input(
    z.object({
      id: z.string().min(1, { message: "Project ID is required" }),
      title: z.string().min(1, { message: "Title is required" }).optional(),
      describtion: z.string().nullish(),
      template: z
        .enum(["REACT", "NEXTJS", "EXPRESS", "HONO", "ANGULAR", "VUE"])
        .optional(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const { id, ...updateData } = input;
    const userId = ctx.auth.userId;

    // Early return for unauthorized users
    if (!userId) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    try {
      // Verify project exists and belongs to user in single query
      const project = await prisma.playground.findUnique({
        where: { id, userId },
        select: { id: true }
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found or access denied",
        });
      }

      // Only update fields that were provided
      const dataToUpdate: Record<string, any> = {};
      if (input.title !== undefined) dataToUpdate.title = input.title;
      if (input.describtion !== undefined) dataToUpdate.describtion = input.describtion;
      if (input.template !== undefined) dataToUpdate.template = input.template;

      const updatedProject = await prisma.playground.update({
        where: { id },
        data: dataToUpdate,
      });

      // Revalidate paths that might be affected
      revalidatePath("/dashboard");
    

      return updatedProject;
    } catch (error) {
      console.error("Project update error:", error);
      
      // Handle Prisma errors specifically
      /* if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Database error occurred",
        });
      } */

      // Re-throw TRPC errors
      if (error instanceof TRPCError) throw error;

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update project",
      });
    }
  }),


 /* 🚀duplicateProjectById */
  duplicateProjectById: protechedRoute
  .input(
    z.object({
      id: z.string().min(1, { message: "Project ID is required" }),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.auth.userId;
    if (!userId) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "User not found",
      });
    }

    try {
      const project = await prisma.playground.findUnique({
        where: { id: input.id },
      });

      if (!project || project.userId !== userId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found or you do not have permission",
        });
      }

      const duplicatedProject = await prisma.playground.create({
        data: {
          title: `${project.title} (Copy)`,
          describtion: project.describtion,
          template: project.template,
          userId,
        },
      });

      revalidatePath("/dashboard");

      return duplicatedProject;
    } catch (error: any) {
      console.error("Error duplicating project:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error?.message || "Failed to duplicate project",
      });
    }
  }),



/* 🚀saveCode */
/* 🚀saveCode */
saveCode: protechedRoute
  .input(
    z.object({
      playgroundId: z.string().min(1, "Playground ID is required"),
      data: z.string() // Change from z.any() to z.string()
    })
  )
  .mutation(async ({ ctx, input }) => {
    console.log('🔵 saveCode mutation called, data length:', input.data.length);

    // Verify playground exists and belongs to user
    const playground = await prisma.playground.findUnique({
      where: {
        id: input.playgroundId,
        userId: ctx.auth.userId
      }
    });

    if (!playground) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Playground not found or access denied"
      });
    }

    try {
      // First try to find existing template file
      const existingFile = await prisma.templateFile.findFirst({
        where: {
          playgroundId: input.playgroundId
        }
      });

      let result;
      if (existingFile) {
        // Update existing file - store the string data directly
        result = await prisma.templateFile.update({
          where: { id: existingFile.id },
          data: { 
            content: input.data, // Store the string directly
            updatedAt: new Date() 
          }
        });
      } else {
        // Create new file - store the string data directly
        result = await prisma.templateFile.create({
          data: {
            playgroundId: input.playgroundId,
            content: input.data // Store the string directly
          }
        });
      }

      revalidatePath(`/playground/${input.playgroundId}`);
      revalidatePath("/dashboard");

      return result;
    } catch (error) {
      console.error("SaveCode error:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Failed to save code"
      });
    }
  })
 
});