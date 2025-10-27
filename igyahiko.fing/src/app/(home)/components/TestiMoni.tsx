import React from 'react'
import TestiCol from './TestiCol'
import { testimonials } from '@/constant/constant'

const TestiMoni = () => {
  return (
    <section className='py-10 md:py-20'>
      <div className='container mx-auto'>
        <div className='border border-white/20 px-2 py-1 rounded-md w-fit mx-auto'>
            <p className='text-center font-mono '>Testimonials</p>
        </div>

        <div className='mt-5' >
            <h1 style={{fontFamily: "poppins"}} className='font-bold text-center text-5xl md:text-6xl capitalize'>What our <span className='text-5xl md:text-7xl font-extrabold dark:text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 glow-gradient animate-gradientShift'>User</span> says 🚀</h1>
        </div>

        <div className='text-xl mt-2 font-mono'>
            <p className='text-center'>From intutive design to powerfull feature our app has</p>
             <p className='text-center'>become and essential tool for users around India!..</p>
            
        </div>
         <div className='h-[400px] lg:h-[600px] mt-8 overflow-hidden [mask-image:linear-gradient(to_bottom,_transparent,_black_20%,_black_90%,_transparent)]  md:flex gap-10'>
         <TestiCol data={testimonials} reverse />
         <TestiCol data={testimonials} />
         <TestiCol data={testimonials} reverse />
         
         </div> 
      </div>
    </section>
  )
}

export default TestiMoni