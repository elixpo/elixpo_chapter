import { auth } from '@clerk/nextjs/server';
import { initTRPC, TRPCError } from '@trpc/server';
import { cache } from 'react';
import superjson from 'superjson'
export const createTRPCContext = cache(async () => {
  /**
   * @see: https://trpc.io/docs/server/context
   */
  return { auth: await auth() };
});
export type Context = Awaited<ReturnType<typeof createTRPCContext>>
// Avoid exporting the entire t-object
// since it's not very descriptive.
// For instance, the use of a t variable
// is common in i18n libraries.
const t = initTRPC.context<Context>().create({
  /**
   * @see https://trpc.io/docs/server/data-transformers
   */
  transformer: superjson,
});

const isAuth = t.middleware(({next,ctx}) => {
   if(!ctx.auth.userId) {
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