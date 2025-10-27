import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import React, { useState } from 'react'
import GlowingGradientText from '../../components/GlowingText'
import Image from 'next/image'
import { IMAES } from '../../../../../public/assets/images/images'
import TemplateModal from './TemplateModal'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTRPC } from '@/trpc/client'
import { useRouter } from 'next/navigation'


const AddProjectButton = () => {
  const trpc = useTRPC();  
  const queryClient = useQueryClient();
  const router = useRouter()

  const [isModalOpen, setIsModalOpen] = useState(false);
 /*  const [seletedTemplate, setSelectedTemplate] = useState<SelectedTempProps | null>(null); */   
  const createProject = useMutation(trpc.playground.createPlayground.mutationOptions({
     onSuccess: (data) => {
         queryClient.invalidateQueries({queryKey: [['playground', 'getAllPlayground']]})
         setIsModalOpen(false)
         router.push(`/playground/${data.id}`)
     }
  }))
  const handelSubmit = (data: {
    title: string;
    describtion?: string;
    template: "REACT" | "NEXTJS" | "EXPRESS" | "VUE" | "HONO" | "ANGULAR";
  }) => { 
      createProject.mutate({
        title: data.title,
        description: data.describtion,
        template: data.template
      })
  }
  
  return (
  <>
    <div  onClick={() => setIsModalOpen(true)}  className="group ">
      <div className='flex justify-between items-center gap-4 md:gap-10 pl-3 md:pl-6  bg-muted border-white/15 border transition-transform duration-300 scale-100 group-hover:scale-105'>
         <div className="flex items-center gap-2">
          <Button className="transition-transform bg-transparent shadow-none borer-none hover:bg-transparent duration-300 group-hover:rotate-90">
            <Plus className="size-5" color='#c9184a' />
          </Button> 
          <div className="flex flex-col w-fit">
            <span className="font-mono ">Add Project</span>
            <GlowingGradientText>
              Create a Playground
            </GlowingGradientText>
          </div>
        </div>

        <div className='relative '>
                  <div className="absolute inset-0 z-0 bg-gradient-to-l from-pink-500/30 via-pink-500/10 to-transparent" />
    
            <Image alt='' src={IMAES.ProjectButton} className='w-24 md:w-32' />
        </div>
      </div>
    </div>

   {
    isModalOpen && (
      <TemplateModal
      isOpen={isModalOpen}
      onClose={() => setIsModalOpen(false)}
      onSubmit={handelSubmit}
    />
    )
   }
    
  </>
  )
}

export default AddProjectButton




