'use client'
import { Badge } from '@/components/ui/badge'
import ImageCursorTrail from '@/components/ui/image-cursortrail'
import { SparklesIcon } from 'lucide-react'
import React from 'react'

const Impress = () => {

const images = [
  "https://images.pexels.com/photos/30082445/pexels-photo-30082445.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2",
  "https://images.unsplash.com/photo-1692606743169-e1ae2f0a960f?q=80&w=3560&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1709949908058-a08659bfa922?q=80&w=1200&auto=format",
  "https://images.unsplash.com/photo-1548192746-dd526f154ed9?q=80&w=1200&auto=format",
  "https://images.unsplash.com/photo-1644141655284-2961181d5a02?q=80&w=3000&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.pexels.com/photos/30082445/pexels-photo-30082445.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2",
  "https://assets.lummi.ai/assets/QmNfwUDpehZyLWzE8to7QzgbJ164S6fQy8JyUWemHtmShj?auto=format&w=1500",
  "https://images.unsplash.com/photo-1706049379414-437ec3a54e93?q=80&w=1200&auto=format",
  "https://assets.lummi.ai/assets/Qmb2P6tF2qUaFXnXpnnp2sk9HdVHNYXUv6MtoiSq7jjVhQ?auto=format&w=1500",
  "https://images.unsplash.com/photo-1508873881324-c92a3fc536ba?q=80&w=1200&auto=format",
]

  return (
   <section className='py-20 overflow-x-clip'>
     <div className='container mx-auto'>
        <div className='flex flex-col items-center gap-y-5'>
            <div  className='flex items-center gap-2 rounded-2xl font-mono border px-4 py-1'>
             <SparklesIcon className='fill-[#EEBDE0] stroke-1 text-neutral-800' />
            <span>To Impress</span>
         </div>

      
            <section className="mx-auto  w-full max-w-8xl bg-neutral-950 rounded-[24px] border border-black/5 p-2 shadow-sm md:rounded-t-[44px]">
      <div className="relative mx-auto flex w-full flex-col rounded-[24px] border border-black/5 bg-neutral-800/5  shadow-sm md:items-start md:gap-8 md:rounded-b-[20px] md:rounded-t-[40px] ">
        <ImageCursorTrail
          items={images}
          maxNumberOfImages={5}
          distance={25}
          imgClass="sm:w-40 w-28 sm:h-48 h-36  "
          className=" max-w-8xl rounded-3xl "
        >
          <article className="relative z-50 flex flex-col items-center justify-center ">
           {/*  <Badge
              variant="outline"
              className="mb-3 rounded-[14px] border border-black/10 bg-neutral-900 text-base md:left-6"
            >
              <SparklesIcon className="  fill-[#EEBDE0] stroke-1 text-neutral-800" />{" "}
              Component Preview
            </Badge> */}
            <h1  className="max-w-4xl text-center text-7xl font-black font-[poppins] tracking-tight ">
             <span className='text-amber-300'>FingUI</span> is here to express not to impress.
            </h1>
          </article>
        </ImageCursorTrail>
      </div>
    </section>
         
        </div> 
     </div>
   </section>
  )
}

export default Impress