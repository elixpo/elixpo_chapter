import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createTRPCContext } from '@/trpc/init';
import { appRouter } from '@/trpc/routers/_app';
import { auth } from '@clerk/nextjs/server';

const handler = async (req: Request) => {
  try {
    // Debug: Check if auth is available in fetch handler
    const authData = await auth();
    console.log('🔐 Auth in fetchHandler:', {
      userId: authData?.userId,
      sessionId: authData?.sessionId,
      orgId: authData?.orgId,
    });

    return await fetchRequestHandler({
      endpoint: '/api/trpc',
      req,
      router: appRouter,
      createContext: async () => {
        const ctx = await createTRPCContext();
        console.log('📋 Context created:', {
          userId: ctx.auth?.userId,
          hasAuth: !!ctx.auth,
        });
        return ctx;
      },
    });
  } catch (err) {
    console.error('❌ tRPC fetchRequestHandler error:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
};

export { handler as GET, handler as POST };