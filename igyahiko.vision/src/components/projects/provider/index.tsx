'use client'
import { loadProject } from '@/redux/slices/shapes';
import { restoreViewport } from '@/redux/slices/viewport';
import React, { useEffect } from 'react'
import { useDispatch } from 'react-redux';
interface Props {
   initialProject: any;
   children: React.ReactNode
}
const CanvasProjectProvider = ({children,initialProject}: Props) => {
  const dispatch = useDispatch()
 useEffect(() => {
  const projectData = initialProject?.__valueJSON || initialProject?._valueJSON;
  if (!projectData) return;

  if (projectData.sketchesData) {
    dispatch(loadProject(projectData.sketchesData));
  }

  if (projectData.viewportData) {
    dispatch(restoreViewport(projectData.viewportData));
  }
}, [dispatch, initialProject]);

  return (
    <div>{children}</div>
  )
}

export default CanvasProjectProvider