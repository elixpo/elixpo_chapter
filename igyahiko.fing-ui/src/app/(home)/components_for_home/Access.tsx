
'use client'
import BadgeButton from '@/components/ui/badge-button'

import ShareButton from '@/components/ui/share-button'
import SlideButton from '@/components/ui/slide-button'
import WrapButton from '@/components/ui/wrap-button'
import { useScroll, useTransform,motion } from 'framer-motion'
import {  Facebook, Linkedin, Share, SparklesIcon, Twitter } from 'lucide-react'
import Link from 'next/link'
import React, { useRef } from 'react'
import { BsDiscord } from 'react-icons/bs'
import { Three3dPng } from '../../../../public/assets/images/images'


const Access = () => {
       const sectionRef = useRef(null)

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  })

  const translateY = useTransform(scrollYProgress, [0, 1], [150, -150]) 
     const shareLinks = [
    {
      icon: Twitter,
      onClick: () => window.open("https://twitter.com/share"),
      label: "Share on Twitter",
    },
    {
      icon: Facebook,
      onClick: () => window.open("https://facebook.com/share"),
      label: "Share on Facebook",
    },
    {
      icon: Linkedin,
      onClick: () => window.open("https://linkedin.com/share"),
      label: "Share on LinkedIn",
    },
    {
      icon: BsDiscord,
      onClick: () => navigator.clipboard.writeText(window.location.href),
      label: "Copy link",
    },
  ]
  return (
   <section className='py-10 overflow-x-clip relative' ref={sectionRef} >
    <div className='container mx-auto'>
      <div className='flex flex-col items-center gap-y-5'>
         <div  className='flex items-center gap-2 rounded-2xl font-mono border px-4 py-1'>
             <SparklesIcon className='fill-[#EEBDE0] stroke-1 text-neutral-800' />
            <span>Click in Style</span>
         </div>

         <div className='grid grid-cols-1 md:grid-cols-2 py-0 md:py-20' >
           <div className='flex items-center md:items-start flex-col px-4 md:px-0'>
             <span  className='text-5xl text-center font-[poppins] md:text-left md:text-8xl font-black '><span className='dark:text-amber-200 text-amber-400'>Buttons</span> That Fit Every Style.</span>
            <p className='text-center md:text-left font-mono mt-4 text-xs md:text-xl '>From minimal to bold, discover button variants that add <span className='text-red-400'>
                personality</span> and <span className='text-blue-400'>functionality</span> to your <span className='text-amber-400'>project</span>.</p>

            <div className='w-fit text-left dark:bg-amber-300 bg-amber-400 py-2 px-4 rounded-none text-black mt-5'>
             <Link
              href={"/"}
             >
             <span className='font-mono'>
                Learn More.
             </span>
             </Link>
            </div>
           </div>

           <div className='flex flex-col  items-center md:items-end justify-start  gap-y-10 mt-10 md:mt-6 '>
              <ShareButton
             /* @ts-expect-error ShareButton component has no typed props for `links` */
                links={shareLinks}
                className='font-mono'
               >
               <Share/>
                  Share
               </ShareButton>
                <SlideButton 
            
              />
               <BadgeButton/>
                <WrapButton>
                Let&apos;s Build Sleek.
            </WrapButton>
           </div>
         </div>
      </div>

       
                 <motion.img
                   src={Three3dPng.Three3d4.src}
                   alt=''
                   width={262}
                   height={262}
                   style={{ translateY }}
                   className='hidden md:block absolute -top-10 left-20'
                 />
    </div>
   </section>
  )
}

export default Access
