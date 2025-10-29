import { auth } from '@clerk/nextjs/server';
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson'

export const createTRPCContext = async () => {
  /**
   * @see: https://trpc.io/docs/server/context
   */
  return { auth: await auth() };
};

export type Context = Awaited<ReturnType<typeof createTRPCContext>>

const t = initTRPC.context<Context>().create({
  /**
   * @see https://trpc.io/docs/server/data-transformers
   */
  transformer: superjson,
});

const isAuth = t.middleware(({ next, ctx }) => {
  console.log('🔒 isAuth middleware - userId:', ctx.auth?.userId);
  
  if (!ctx.auth?.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Not Authenticated"
    })
  }

  return next({
    ctx: {
      auth: ctx.auth
    }
  })
})

// Base router and procedure helpers
export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const baseProcedure = t.procedure;
export const protechedRoute = t.procedure.use(isAuth)