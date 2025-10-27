import React from 'react'
import GlowingGradientText from './GlowingText'
import FaqCards from './FAQCard'

import { faq } from '@/constant/constant'

const Faq = () => {
  return (
     <section className='py-5 lg:pt-10 px-7 md:px-2'>
           <div className='container mx-auto flex flex-col items-center justify-center'>
             <button className='uppercase border text-md flex items-center py-1 px-3 rounded-md gap-2' style={{ fontFamily: "monospace", fontWeight: 600,}}>FAQ</button>
             <h1 className=' mt-5 text-3xl lg:text-6xl text-center' style={{fontFamily: "poppins", fontWeight: 700}}>Question ? We&apos;e got<span className=''> <GlowingGradientText> answers.</GlowingGradientText> </span></h1>

            <div className='flex flex-col max-w-xl mx-auto justify-center mt-5'>
                <FaqCards data={faq} />
            </div>

           </div>
       </section>
  )
}

export default Faq