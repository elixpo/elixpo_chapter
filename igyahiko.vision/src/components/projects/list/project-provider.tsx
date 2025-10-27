'use client'
import { fetchProjectSuccess } from '@/redux/slices/project';
import { useAppDispatch } from '@/redux/store';
import React, { useEffect } from 'react'

interface Props {
    children: React.ReactNode;
    initialProject: any;
}
const ProjectProvider = ({children,initialProject}: Props) => {
  const dispatch = useAppDispatch();
  useEffect(() => {
    if(initialProject?._valueJSON) {
         const projectsData = initialProject._valueJSON;
         dispatch(
            fetchProjectSuccess(
               {
                 projects: projectsData,
                 total: projectsData.length
               }
            )
         )
    }
  },[dispatch,initialProject])
  return (
    <div>{children}</div>
  )
}

export default ProjectProvider