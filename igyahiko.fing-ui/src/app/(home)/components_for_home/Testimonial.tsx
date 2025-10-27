'use client'
import { SparklesIcon } from 'lucide-react'
import React, { useRef } from 'react'
import TestiRow from './TestiRow'
import { testimonials } from '@/constant/constant'
import { useScroll, useTransform, motion } from 'framer-motion'
import { Three3dPng } from '../../../../public/assets/images/images'

const Testimonial = () => {
      const sectionRef = useRef(null)

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  })

  const translateY = useTransform(scrollYProgress, [0, 1], [150, -150]) 
  return (
   <section
   ref={sectionRef}
   className='py-20 overflow-y-clip relative'
   >
  <div className='container mx-auto'>
   <div className='flex flex-col items-center gap-y-5 '>
       <div  className='flex items-center gap-2 rounded-2xl font-mono border px-4 py-1'>
             <SparklesIcon className='fill-[#EEBDE0] stroke-1 text-neutral-800' />
            <span>Testimonials</span>
         </div>

         <div className='flex flex-col items-center ' >
            <span  className='text-5xl text-center md:text-7xl font-[poppins] font-black'>Loved By <span className='dark:text-amber-200 text-amber-400'>Developer</span></span>
            <p className='text-xs md:text-lg mt-2 font-mono text-center'>See what the community is saying about <span className='text-blue-400'>FingUI.</span></p>
         </div>

        <div
  className="relative h-[500px] lg:w-[1300px]  lg:h-[500px]  overflow-hidden 
  [mask-image:linear-gradient(to_right,transparent,black_70%,black_10%,transparent)] 
  [mask-repeat:no-repeat] [mask-size:100%_100%]
  px-6 lg:px-12 flex flex-col gap-12"
>
  {/* Row 1 */}
  <TestiRow data={testimonials} />

  {/* Row 2 (reverse direction) */}
  <TestiRow data={testimonials} reverse />

  
  
</div>

 <motion.img
            src={Three3dPng.Three3d3.src}
            alt=''
            width={262}
            height={262}
            style={{ translateY }}
            className='hidden md:block absolute right-32 -top-2'
          />
   </div>
  </div>
   </section>
  )
}

export default Testimonial  