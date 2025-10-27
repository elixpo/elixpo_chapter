
import { SkiperCard } from '@/components/ui/skiper-card'
import WrapButton from '@/components/ui/wrap-button'
import { cn } from '@/lib/utils'
import React from 'react'
import {  Show } from '../../../../public/assets/images/images'
import Link from 'next/link'
import { ButtonMorph } from '@/components/FingUIComponents/buttons/button-morph'
import { Button } from '@/components/ui/button'

const Hero = () => {
  return (
    <section  className='py-20 overflow-x-clip'>
        <div className='container   mx-auto px-3 md:px-0'>
          
            <div className='flex flex-col  items-center'>
            <div className='text-center font-mono border px-4 py-1 rounded-2xl w-fit'>
                <p>Now: available: FingUI CLI 🚀</p>
            </div>
                <h1 className='text-6xl mt-4 md:mt-2 font-black text-center font-[poppins]'>Build Sleek Interfaces, Effortlessly.</h1>
                <div className='text-center w-fit text-base mt-4 px-0 md:px-28 font-mono'>
               <p>FingUI is a modern React component library powered by Tailwind CSS and Framer Motion. Create beautiful, animated, and reusable UI components with minimal effort.</p>
            </div>
            
            </div>

            

           <Link 
             href={"/docs"}
           >
            <WrapButton 
            
            className='mt-5'>
                Let&apos;s Build Sleek.
            </WrapButton>
           

           </Link>
       
            <div className=" mx-auto  max-w-6xl mt-10 rounded-[34px] bg-neutral-700">
              <div className="relative z-10 grid w-full gap-8 rounded-[28px] bg-neutral-950 p-2">
                <SkiperCard
                
                  step1img1Class={cn(
                    "pointer-events-none w-[50%] border border-stone-100/10 transition-all duration-500 dark:border-stone-700/50",
                    "left-1/4 top-[57%] rounded-[24px] max-md:scale-[160%] max-md:rounded-[24px] md:left-[35px] md:top-[29%]",
                    "md:group-hover:translate-y-2"
                  )}
                  step1img2Class={cn(
                    "pointer-events-none w-3/5 overflow-hidden border border-stone-100/10 transition-all duration-500 dark:border-stone-700/50",
                    "left-[69%] top-[53%] rounded-2xl max-md:scale-[160%] max-md:rounded-[24px] md:left-[calc(50%+35px+1rem)] md:top-[21%]",
                    "md:group-hover:-translate-y-6 "
                  )}
                  step2img1Class={cn(
                    "pointer-events-none w-[50%] overflow-hidden rounded-t-[24px] border border-stone-100/10 transition-all duration-500 dark:border-stone-700",
                    "left-1/4 top-[69%] max-md:scale-[160%] md:left-[35px] md:top-[30%]",
                    "md:group-hover:translate-y-2"
                  )}
                  step2img2Class={cn(
                    "pointer-events-none w-2/5 overflow-hidden rounded-2xl rounded-t-[24px] border border-stone-100/10 transition-all duration-500 group-hover:-translate-y-6 dark:border-stone-700",
                    "left-[70%] top-[53%] max-md:scale-[140%] md:left-[calc(50%+27px+1rem)] md:top-1/4",
                    "md:group-hover:-translate-y-6"
                  )}
                  step3imgClass={cn(
                    "pointer-events-none w-[90%] overflow-hidden rounded-t-[24px] border border-stone-100/10 transition-all duration-500 dark:border-stone-700",
                    "left-[5%] top-[50%] md:left-1/2 md:left-[68px] md:top-[30%]"
                  )}
                  step4imgClass={cn(
                    "pointer-events-none w-[90%] overflow-hidden rounded-t-[24px] border border-stone-100/10 transition-all duration-500 dark:border-stone-700",
                    "left-[5%] top-[50%] md:left-1/2 md:left-[68px] md:top-[30%]"
                  )}
                  description="Whether you’re building dashboards, apps, or landing pages—fingUI."
                  bgClass="hover:lg:bg-amber-300 "
                  //  eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  //   @ts-ignore
                  image={{
                     step1light1: Show.Show1,
                     step1light2: Show.Show3,
                    step2light1: Show.Show2,
                    step2light2: Show.Show5,
                    step3light: Show.Show4, 
                    step4light: Show.Show6,  
                    alt: "Something",
                  }}
                  title="⚡️ Supercharge Your Frontend with FingUI."
                />
              </div>
            </div>

            
        </div>
    </section>
  )
}

export default Hero





