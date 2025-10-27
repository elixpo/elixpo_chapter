
import InfiniteCastle from '@/components/canvas/infinite_castle/inifinite-castle'
import CanvasProjectProvider from '@/components/projects/provider'
import { ProjectQuery } from '@/convex/query.config'
import React from 'react'
interface Props {
     searchParams: Promise<{
         project: string
     }>
}
const Page = async ({searchParams}: Props) => {
  const params = await searchParams
  const projectId = params.project
  const {profile,project} = await ProjectQuery(projectId)
  if(!projectId) {
     return (
         <div>
            <p>No project exist.{profile?.name}</p>
         </div>
     )
  }

  if(!profile) {
     <div className='w-full h-screen flex items-center justify-center'>
        <p>Authentication Required</p>
     </div>
  }

  if(!project) {
     <div className='w-full h-screen flex items-center justify-center'>
        <p>Project Not Found, access denied</p>
     </div>
  }
  return (
    <CanvasProjectProvider initialProject={project} >
        <InfiniteCastle/>
    </CanvasProjectProvider>
  )
}

export default Page