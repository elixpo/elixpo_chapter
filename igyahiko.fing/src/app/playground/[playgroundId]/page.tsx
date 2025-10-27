
import { getQueryClient, trpc } from '@/trpc/server';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import React, { Suspense } from 'react'
import PlaygroundView from '@/modules/playground/ui/views/PlaygroundView';
import { ErrorBoundary } from 'react-error-boundary';
import GlobalError from '@/components/Error/page';
import CustomLoader from '@/components/loader/CustomLoader';


interface Props {
   params: Promise<{
     playgroundId: string
   }>
}


const Page = async ({params}: Props) => {
  const {playgroundId} = await params;
  const qureyClient = getQueryClient();
  void qureyClient.prefetchQuery(trpc.playground.getPlayground.queryOptions({
     id: playgroundId
  }))
  
 
  return (
   <HydrationBoundary
    state={dehydrate(qureyClient)}>
   <ErrorBoundary fallback={<GlobalError/>} > 
    <Suspense fallback={<CustomLoader/>} >
      <PlaygroundView playgroundId={playgroundId} />
    </Suspense>
   </ErrorBoundary>
   </HydrationBoundary>
  )
}

export default Page