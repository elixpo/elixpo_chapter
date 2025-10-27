'use client'
import { PricingTable } from '@clerk/nextjs'

import React from 'react'

import { useCurrentTheme } from '@/hooks/use-current-theme'
import { dark } from '@clerk/themes'


const Billing = () => {
  
  const currTheme = useCurrentTheme()
  return (

    <section className='py-10 md:py-32'>
   
      <div className='container  mx-auto'>
        <div>
            <button
            className='uppercase mx-auto border text-md flex items-center py-1 px-3 rounded-md gap-2'
            style={{ fontFamily: 'monospace', fontWeight: 600 }}
          >
            Pricing
          </button>
        </div>
       {/*  <Image alt='' className='mx-auto mt-2  w-32 h-32' src={logos.logo7} /> */}
        <div className='text-center text-3xl md:text-6xl font-bold' style={{fontFamily: "poppins"}}>
            <h1>Find the <span className="text-3xl md:text-6xl font-extrabold dark:text-transparent bg-clip-text dark:bg-gradient-to-r from-yellow-500 via-red-400 to-pink-500  animate-gradientShift" >perfect</span> plan,</h1>
            <h1>that works for you.</h1>
        </div>

        <div className='mt-5 px-10 md:px-32 lg:px-44'>
            <PricingTable
  appearance={{
   
    elements: {
      pricingTableCard: "rounded-md p-6! hover:shadow-lg transition-all duration-300",
    },
     baseTheme: currTheme === 'dark' ? dark : undefined 
  }}
/>

        </div>
      </div>
   </section>

  )
}

export default Billing