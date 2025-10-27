'use client'


import React, { useRef } from 'react'
import { IMAES } from '../../../../public/assets/images/images'
import { Button } from '@/components/ui/button'
import { useScroll, useTransform, motion } from 'framer-motion'

const CallToAction = () => {
  const sectionRef = useRef(null)

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  })

  // Use translateY motion value
  const translateY = useTransform(scrollYProgress, [0, 1], [150, -150])

  return (
    <section ref={sectionRef} className='py-10 md:py-52 '>
      <div className='container mx-auto relative'>
        <div>
          <h1 className='text-center text-4xl md:text-7xl font-bold' style={{ fontFamily: 'poppins' }}>
            Sign up for free today
          </h1>
          <p className='text-center mt-2 font-mono'>
            Log in to save your work, access AI tools, and build smarter — faster.
          </p>
        </div>

        <div className='mt-8 flex justify-center gap-4'>
          <Button
            className='relative overflow-hidden font-mono px-7 py-2 text-white 
                       bg-gradient-to-r from-purple-500 via-pink-600 to-red-600 
                       bg-[length:200%_200%]'
            style={{
              animation: 'shine 2s linear infinite',
              backgroundSize: '200% 200%',
              backgroundPosition: '0% 50%',
            }}
          >
            SignIn
          </Button>
          <Button variant='outline'>Learn More</Button>
        </div>

        {/* Parallax Images */}
        <motion.img
          src={IMAES?.Spring?.src}
          alt=''
          width={262}
          height={262}
          style={{ translateY }}
          className='absolute top-10 hidden md:block'
        />
        <motion.img
          src={IMAES?.Star?.src}
          alt=''
          width={262}
          height={262}
          style={{ translateY }}
          className='absolute hidden md:block right-0 -top-10 rotate-[40deg]'
        />
      </div>
    </section>
  )
}

export default CallToAction
