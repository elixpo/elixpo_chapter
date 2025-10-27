"use client"
import MinimalCard, { MinimalCardDescription, MinimalCardImage, MinimalCardTitle } from '@/components/ui/minimal-card'
import { ArrowBigLeft, SparklesIcon } from 'lucide-react'
import React from 'react'
import { CARDS } from '../../../../public/assets/images/images'
import Image from 'next/image'


const Works = () => {

   const cards = [
  {
    title: "1. Install & Sync",
    description: [
      "Developer installs your CLI/tool with one command.",
      "They can sync your components into their project (just like shadcn/ui).",
      "Components live in their project (no lock-in, fully editable)."
    ],
    src: CARDS.card4
  },
  {
    title: "2. Customize & Theme",
    description: [
      "All components are built with Tailwind + your design tokens.",
      "Users can quickly customize colors, typography, radius, etc. via a config (like tailwind.config.js).",
      "Variants and props are ready to tweak — no need to rewrite from scratch."
    ],
    src: CARDS.card3
  },
  {
    title: "3. Build Faster, Ship Better",
    description: [
      "Developers compose your components to create pages instantly.",
      "Everything is accessible, responsive, and production-ready.",
      "Updates to your library can be pulled in anytime with the sync command."
    ],
    src: CARDS.card5
  }
];

  return (
    <section className="relative py-20 overflow-x-clip">
      {/* Background dots */}
     {/*  <div
        className="absolute inset-0 -z-10 w-full h-full
        bg-[radial-gradient(circle,rgba(0,0,0,0.05)_1px,transparent_1px)]
        dark:bg-[radial-gradient(circle,rgba(255,255,255,0.12)_1px,transparent_1px)]
        [background-size:18px_18px]
        [mask-image:linear-gradient(to_bottom,transparent,black_20%,black)]
        "
      /> */}

      <div className="container mx-auto">
        <div className="flex flex-col items-center gap-y-5">
          <div className="flex items-center gap-2 rounded-2xl font-mono border px-4 py-1">
            <SparklesIcon className="fill-[#EEBDE0] stroke-1 text-neutral-800" />
            <span>How it work</span>
          </div>

          <div className="flex flex-col items-center">
            <span
             
              className="text-4xl font-[poppins] f capitalize text-center md:text-6xl font-black"
            >
              Simple process,{' '}
              <span className="dark:text-amber-200 text-amber-300">beautiful</span> results
            </span>
            <p className="text-xs md:text-lg mt-2 font-mono text-center">
              Customize components just like you want with{' '}
              <span className="text-blue-400">tailwind_css.</span>
            </p>
          </div>
         <div className='grid grid-cols-1 md:grid-cols-3 gap-5 px-5 md:px-0'>
           {
            cards.map((data,i) => (
                 <MinimalCard key={i}>
                 <Image
                  
                  src={data.src}
                  alt={data.title}
                 />
                 <MinimalCardTitle className='font-black' style={{fontFamily: "poppins"}}>{data.title}</MinimalCardTitle>
                 <MinimalCardDescription className='font-mono text-xs mt-2'>{data.description}</MinimalCardDescription>
                 </MinimalCard>
            ))
           }
         </div>
        </div>
      </div>
    </section>
  )
}

export default Works
