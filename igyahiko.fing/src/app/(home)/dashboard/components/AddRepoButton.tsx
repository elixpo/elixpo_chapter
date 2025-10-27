import { Button } from '@/components/ui/button'
import { GitBranch } from 'lucide-react'
import React from 'react'
/* import GlowingGradientText from '../../components/GlowingText'
import Image from 'next/image'
import { IMAES } from '../../../../../public/assets/images/images' */

const AddRepoButton = () => {
  return (
    <div className="group ">
      <div className='flex justify-between items-center gap-4 md:gap-10 py-7.5 md:pl-6  bg-muted border-white/15 border transition-transform duration-300 scale-100 group-hover:scale-105'>
         <div className="flex items-center gap-2">
          <Button className="transition-transform bg-transparent border-none shadow-none hover:bg-transparent duration-300 group-hover:rotate-90">
            <GitBranch className="size-5" color='#c9184a' />
          </Button> 
          <div className="flex flex-col w-fit">
            <span className="font-mono ">Github Repository</span>
            <span className='text-xs text-muted-foreground'> Work with Repository in our next generation editor</span>
          </div>
        </div>

       
      </div>
    </div>
  )
}

export default AddRepoButton




