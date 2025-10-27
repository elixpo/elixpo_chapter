"use client"
import React, { useRef } from 'react'

import FaqCards from './FaqCards'
import { motion, useScroll, useTransform } from 'framer-motion'

import { faq } from '@/constant/constant'
import { SparklesIcon } from 'lucide-react'
import { Three3dPng } from '../../../../public/assets/images/images'

const Faq = () => {
     const sectionRef = useRef(null)

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  })

  const translateY = useTransform(scrollYProgress, [0, 1], [300, -350]) 
  return (
     <section ref={sectionRef} className='py-20 overflow-x-clip relative'>
          <div className='container mx-auto'>
           <div className='flex flex-col items-center gap-y-6'>
   <div className="flex items-center gap-2 rounded-2xl font-mono border px-4 py-1">
            <SparklesIcon className="fill-[#EEBDE0] stroke-1 text-neutral-800" />
            <span>FAQ</span>
          </div>

           <div className="flex flex-col items-center">
            <span
             
              className="text-4xl capitalize font-[poppins] text-center md:text-6xl font-black"
            >
              All you need to{' '}
              <span className="dark:text-amber-200 text-amber-300">Know.</span>
            </span>
            <p className='font-mono text-xs md:text-lg text-center mt-1'>Quick insights before you dive in.</p>
          </div>


          <div className='flex flex-col max-w-xl mx-auto justify-center mt-0 px-5 md:px-0'>
                <FaqCards data={faq} />
            </div>
           </div>

        <motion.img
            src={Three3dPng.Three3d1.src}
            alt=''
            width={262}
            height={262}
            style={{ translateY }}
            className='hidden md:block absolute right-32 -top-2'
          />
          <motion.img
            src={Three3dPng.Three3d2.src}
            alt=''
            width={262}
            height={262}
            style={{ translateY }}
            className='hidden md:block absolute bottom-24 left-20'
          />
          </div>
       </section>
  )
}

export default Faq



 /*  <div className='flex flex-col max-w-xl mx-auto justify-center mt-5'>
                <FaqCards data={faq} />
            </div> */