import React from 'react'
import Layout from './layout'
import { ProjectQuery, ProjectsQuery } from '@/convex/query.config'
import ProjectProvider from '@/components/projects/list/project-provider'
import ProjectList from '@/components/projects/list/project-list'
type Props = {
     params: Promise<{
         session: string
     }>
}
const Page = async ({params}: Props) => {
  const {projects} = await ProjectsQuery()
  return (
    
    <ProjectProvider initialProject={projects}>
      <div className='container py-5  mx-auto'>
        <ProjectList/>
      </div>
    </ProjectProvider>
   
  )
}

export default Page