'use client'
import React, { useEffect, useState } from "react"
import {MoodboardImageProps} from "../redux/api/moodboard/index"
import { useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { useMutation } from "convex/react"
import { api } from "../../convex/_generated/api"
import { toast } from "sonner"
import { Id } from "../../convex/_generated/dataModel"
interface StyleFormData {
     images: MoodboardImageProps[ ]
}
export const useMoodBoard = (guideImage: MoodboardImageProps[]) => {
     const [dragActive, setActiveDrag] = useState(false)
     const searchParams = useSearchParams();
     const projectId = searchParams.get('project')
     
     const form = useForm<StyleFormData>({
         defaultValues: {
            images: []
         }
     })
     const {watch, setValue, getValues} = form
     const images = watch('images');
     const generateMoodboardUrl = useMutation(
        api.moodboard.generatedUploadedUrl
     )
     const removeMoodboardImage = useMutation(
        api.moodboard.removeMoodBoardImage
     )
     const addMoodBoardImage = useMutation(
        api.moodboard.addMoodBoardImage
     )

     const uploadImage = async (file: File): Promise<{storageId: string, url?: string}> => {
        
         const uploadUrl = await generateMoodboardUrl();
          const res = await fetch(uploadUrl,{
                method: "POST",
                headers: { 'Content-Type': file.type },
                body: file
          }) 
         if(!res.ok) {
             throw new Error(
                `upload failed ${res.statusText}`
             )
         }
         const { storageId } = await res.json();
         if(projectId) {
            await addMoodBoardImage({
                 projectId: projectId as Id<'projects'>,
                 storageId: storageId as Id<'_storage'>
            })
         }
         return  {storageId}
        
     }
     useEffect(() => {
    if (!guideImage || guideImage.length === 0) return;

    // Convert server images
    const serverImages: MoodboardImageProps[] = guideImage.map((img: any) => ({
      id: img.id,
      preview: img.url,
      storageId: img.storageId,
      uploaded: true,
      uploading: false,
      isFromServer: true,
    }));

    // Get existing images
    const currentImages = getValues("images");

    // Merge without duplicating
    const mergedImages = [
      ...serverImages,
      ...currentImages.filter(
        (clientImg) =>
          !serverImages.some(
            (serverImg) => serverImg.storageId === clientImg.storageId
          )
      ),
    ];

    // Clean up any blob URLs from client images replaced by server images
    currentImages.forEach((clientImg) => {
      const replacedByServer = serverImages.find(
        (s) => s.storageId === clientImg.storageId
      );
      if (replacedByServer && clientImg.preview.startsWith("blob:")) {
        URL.revokeObjectURL(clientImg.preview);
      }
    });

    setValue("images", mergedImages);
  }, [guideImage, setValue, getValues]);

     const addImage = (file: File) => {
         if(images.length > 5) {
             toast.error('maximun 5 images allowed')
             return
         }

         const newImage: MoodboardImageProps = {
             id: `${Date.now()}-${Math.random()}`,
             file,
             preview: URL.createObjectURL(file),
             uploaded: false,
             uploading: false,
             isFromServer: false
         }
         const updatedImages = [...images, newImage]
         setValue('images',updatedImages)

         toast.success('Images added to mood board')
     }
    const removeImage = async (imageId: string) => {
         const imageToRemove = images.find((img) => img.id === imageId)
         if(!imageToRemove) return

         //if its a server image with storageId, remove it from convex 
         if(imageToRemove.isFromServer && imageToRemove.storageId && projectId) {
            try{
             await removeMoodboardImage({
                projectId: projectId as Id<'projects'>,
                storageId: imageToRemove.storageId as Id<'_storage'>
             })
            }catch(error){
               console.log(error);
               toast.error('failed to remove image from server')
               return
               
            }
         }
         const updateImages = images.filter((img) => {
             if(img.id === imageId) {
                 if(!img.isFromServer && img.preview.startsWith('blob:')) {
                     URL.revokeObjectURL(img.preview)
                 }
                 return false
             }
             return true 
         })
         setValue('images', updateImages)
         toast.success('images removed')
    }

    const handleDrag = (e: React.DragEvent) => {
         e.preventDefault()
         e.stopPropagation()

         if(e.type === 'dragenter' || e.type === 'dragover') {
             setActiveDrag(true)

         }else if(e.type === 'dragleave') {
              setActiveDrag(false)
         }
    }

     const handleDragDrop = (e: React.DragEvent) => {
         e.preventDefault()
         e.stopPropagation()
         setActiveDrag(true)

         const files = Array.from(e.dataTransfer.files)
         const imageFiles = files.filter((file) => file.type.startsWith('image/'))

         if(imageFiles.length === 0) {
             toast.error('Please drop image files only')
             return
         }

         imageFiles.forEach((file) => {
             if(images.length < 5) {
                 addImage(file)
             }
         })
     }

     const handleFileInput = (e:React.ChangeEvent<HTMLInputElement>) => {
         const files = Array.from(e.target.files || [])
         files.forEach((file) => addImage(file))
         e.target.value = ''
     }
   
     useEffect(() => {

        const uploadPendingImage = async () => {
            const currImages = getValues('images')
            for(let i=0; i<currImages.length; i++) {
                 const img = currImages[i]
                 if(!img.uploaded && !img.uploading && !img.error) {
                        const updatedImages = [...currImages]
                        updatedImages[i] = {...img, uploading: true}
                        setValue('images',updatedImages)
                        try {
                          const {storageId} = await uploadImage(img.file!)
                          const finalImage = getValues('images')
                          const finalIndex = finalImage.findIndex(
                            (i) => i.id === img.id
                          )
                          if(finalIndex !== -1) {
                             finalImage[finalIndex] = {
                                ...finalImage[finalIndex],
                                storageId,
                                uploaded: true,
                                uploading: false,
                                isFromServer: true

                             }
                             setValue('images',[...finalImage])
                             
                          }
                        } catch ( error ) {
                          console.log(error)
                          const errorImage = getValues('images')
                          const errorIndex = errorImage.findIndex((i) => i.id === img.id)
                          if(errorIndex !== -1) {
                             errorImage[errorIndex] = {
                                 ...errorImage[errorIndex],
                                 uploading: false,
                                 error: 'upload failed'
                             }
                             setValue('images',[...errorImage ])
                          }
                        }
                 }
            }
        }
        if(images.length > 0) {
             uploadPendingImage()
        }
     },[images, setValue, getValues])

     useEffect(() => {
      return () => {
         images.forEach((img) => {
             URL.revokeObjectURL(img.preview)
         })
      }
     },[])

     return {
         form,
         images,
         addImage,
         removeImage,
         handleDrag,
         handleDragDrop,
         handleFileInput,
         canAddmore: images.length < 5
     }
}