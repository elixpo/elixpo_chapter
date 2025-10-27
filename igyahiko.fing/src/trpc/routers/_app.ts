import { projectRouter } from '@/modules/projects/server/procedures';
import { createTRPCRouter } from '../init';
import { messageRouter } from '@/modules/messages/server/procedures';
import { usageRoute } from '@/modules/usage/server/procedures';
import {  playGroundRouter } from '@/modules/playground/procedures';
export const appRouter = createTRPCRouter({
      usage: usageRoute,
      messages: messageRouter,
      projects: projectRouter,
      playground: playGroundRouter
});
// export type definition of API
export type AppRouter = typeof appRouter;