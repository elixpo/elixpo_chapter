import { FrameShape, Shape } from "@/redux/slices/shapes";

export const isShapeInsideFrame = (shape: Shape, frame: FrameShape): boolean => {
   const frameLeft = frame.x;
   const frameTop = frame.y;
   const frameRight = frame.x + frame.w
   const frameBottom = frame.y + frame.h

   switch(shape.type) {
       case 'rect':
       case 'ellipse':
       case 'frame':

       const centerX = shape.x + shape.w / 2
       const centerY = shape.y + shape.h / 2
       return (
         centerX >= frameLeft &&
         centerX <= frameRight &&
         centerY >= frameTop && 
         centerY <= frameBottom
       )
       case 'text':
        return (
         shape.x >= frameLeft &&
         shape.x <= frameRight &&
         shape.y >= frameTop && 
         shape.y <= frameBottom
        )
      case 'freedraw':
        return shape.points.some((point) => {
         point.x >= frameLeft &&
         point.x <= frameRight &&
         point.y >= frameTop && 
         point.y <= frameBottom
        })

     case 'line':
     case 'arrow':
        const startInside = 
          shape.startX >= frameLeft &&
          shape.startX <= frameRight &&
          shape.startY >= frameTop && 
          shape.startY <= frameBottom
        const endInside = 
          shape.endX >= frameLeft &&
          shape.endX <= frameRight &&
          shape.endY >= frameTop &&
          shape.endY <= frameBottom

        return startInside || endInside
    default: 
      return false
   }
}
export const getShapeInsideFrame = (frame: FrameShape, shapes: Shape[]): Shape[] => {
    const shapesInframe = shapes.filter(
        (shape) => shape.id !== frame.id && isShapeInsideFrame(shape, frame)
    )

    console.log(
        `Frame: ${frame.frameNumber} capture:`,{
            totalShape: shapes.length,
            captured: shapesInframe.length,
            capturedType: shapesInframe.map((s) => s.type)
        }
    )
    return shapesInframe
} 
export const renderShapesOnCanvas = (
   ctx: CanvasRenderingContext2D,
   shape: Shape,
   frameX: number,
   frameY: number
) => {
   ctx.save()
   switch(shape.type) {
      case 'frame':
      case 'ellipse':
      case 'rect':
      const relativeX = shape.x - frameX
      const relativeY = shape.y - frameY
      if(shape.type === 'rect' || shape.type === 'frame') {
        ctx.strokeStyle = shape.stroke && shape.stroke !== 'transparent' ? shape.stroke : '#ffffff'
        ctx.lineWidth = shape.strokeWidth || 2

        const borderRadius = shape.type === 'rect' ? 8 : 0
        ctx.beginPath()
        ctx.roundRect(relativeX,relativeY,shape.w, shape.h, borderRadius)
        ctx.stroke()
      } else if(shape.type === 'ellipse') {
         ctx.strokeStyle = shape.stroke && shape.stroke !== 'transparent' ? shape.stroke : "#ffffff"
         ctx.lineWidth = shape.strokeWidth || 2
         ctx.beginPath()
         ctx.ellipse(
            relativeX + shape.w / 2,
            relativeY + shape.h / 2,
            shape.w / 2,
            shape.h / 2,
            0,
            0,
            2 * Math.PI

         )
         ctx.stroke()
      }
      break

      case 'text':
      const textRelativeX = shape.x - frameX
      const textRelativeY = shape.x - frameY
      ctx.fillStyle = shape.fill || "#ffffff"
      ctx.font = `${shape.fontSize}px ${shape.fontFamily || 'Inter, sans-serif'}`
      ctx.textBaseline = 'top'
      ctx.fillText(shape.text, textRelativeX, textRelativeY)
      break

      case 'freedraw':
        if(shape.points.length > 1) {
             ctx.strokeStyle = shape.stroke || '#ffffff'
             ctx.lineWidth = shape.strokeWidth || 2
             ctx.lineCap = 'round'
             ctx.lineJoin = 'round'
             ctx.beginPath()
             const firstPoints = shape.points[0]
             ctx.moveTo(firstPoints.x - frameX, firstPoints.y - frameY)
             for(let i=1; i<shape.points.length; i++) {
                 const point = shape.points[i]
                 ctx.lineTo(point.x - frameX, point.y - frameY)
             }
             ctx.stroke()
        }
            break;
     case 'line':
        ctx.strokeStyle = shape.stroke || "#ffffff"
        ctx.lineWidth = shape.strokeWidth || 2
        ctx.beginPath()
        ctx.moveTo(shape.startX - frameX, shape.startY - frameY)
        ctx.lineTo(shape.endX - frameX, shape.endY - frameY)
        ctx.stroke()
        break

    case 'arrow':
        ctx.strokeStyle = shape.stroke || "#ffffff"
        ctx.lineWidth = shape.strokeWidth || 2
        ctx.beginPath()
        ctx.moveTo(shape.startX - frameX, shape.startY - frameY)
        ctx.lineTo(shape.endX - frameX, shape.endY - frameY)
        ctx.stroke()
        const headLenght = 10
        const angle = Math.atan2(
             shape.endY - shape.startY,
             shape.endX - shape.startX
       )
       ctx.fillStyle = shape.stroke || '#ffffff'
       ctx.beginPath()
       ctx.moveTo(shape.endX - frameX, shape.endY - frameY)
       ctx.lineTo(
        shape.endX - frameX - headLenght * Math.cos(angle - Math.PI / 6),
        shape.endY - frameY - headLenght * Math.sin(angle - Math.PI / 6)
       ) 
       ctx.lineTo(
        shape.endX - frameX - headLenght * Math.cos(angle + Math.PI / 6),
        shape.endY - frameY - headLenght * Math.sin(angle + Math.PI / 6)
       )    
       ctx.closePath()
       ctx.fill()
       break
   }
   ctx.restore()
  
   
}
export const generateFrameSnapShot = async (
    frame: FrameShape,
    allShapes: Shape[]
): Promise<Blob> => {
    const shapesInsideFrame = getShapeInsideFrame(frame, allShapes)
    const canvas = document.createElement('canvas')
    canvas.width = frame.w
    canvas.height = frame.h
    const ctx = canvas.getContext('2d')
    if(!ctx) {
        throw new Error('Failed to get canvas context')
    }
    ctx.fillStyle = '#000000'
    ctx.fillRect(0,0, canvas.width, canvas.height)

    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, canvas.width, canvas.height)
    ctx.clip()
 shapesInsideFrame.forEach((shape) => {
         renderShapesOnCanvas(ctx, shape, frame.x, frame.y)
    })

     ctx.restore()
    console.log("✅ All shapes has been rendered");
    return new Promise((resolve, reject) => { 
        canvas.toBlob((blob) => {
             if(blob) {
                 resolve(blob)
             } else {
                reject(new Error('Failed to creat image blob'))
             }
        }, 'image/png',
    1.0)
    })
} 

export const downloadBlob = (blob: Blob, filename: string) => {
   const url = URL.createObjectURL(blob)
   const link = document.createElement('a')
   link.href = url
   link.download = filename
   document.body.appendChild(link)
   link.click()
   document.body.removeChild(link)
   URL.revokeObjectURL(url);
}