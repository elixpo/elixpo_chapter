import { FrameShape, Shape } from "@/redux/slices/shapes"
import { AppDispatch, useAppSelector } from "@/redux/store"
import { useState } from "react"
import { useDispatch } from "react-redux"
import {downloadBlob, generateFrameSnapShot} from '@/lib/frame-snapshot'


export const useCanvas = (shape: FrameShape) => {
    const [isGenerating, setIsGenerating] = useState(false)
    const allShapes = useAppSelector((state) => 
      Object.values(state.shapes.shapes?.entities || {}).filter(
        (shape):shape is Shape => shape !== undefined
      )
    )
    const dispatch = useDispatch<AppDispatch>()
    const handleGenerateDesign = async () => {
        try {
          setIsGenerating(true)
          const snapShot = await generateFrameSnapShot(shape,allShapes)
          downloadBlob(snapShot, `frame-${shape.frameNumber}-snapshot.png`)
          const formData = new FormData()
          formData.append('image',snapShot,`frame-${shape.frameNumber}.png`)
          formData.append('frameNumber', shape.frameNumber.toString())

          const urlParams = new URLSearchParams(window.location.search)
          const projectId = urlParams.get('project')
          if(projectId) {
             formData.append('projectId',projectId)
          }
        } catch (error) {
            
        }
    }
    
    return {
         isGenerating,
         handleGenerateDesign
    }
}