import React from 'react'
import { TextScroll } from "@/components/ui/text-scroll"
const Marquee = () => {
  return (
    <section /* ref={sectionRef} */ className='py-0 md:py-20 overflow-x-clip relative'>
          <TextScroll
      className="font-display text-center py-2 text-4xl font-semibold tracking-tighter  text-black dark:text-white md:text-7xl md:leading-[5rem]"
      text="FingUI "
      default_velocity={2}
    />
    </section>
  )
}

export default Marquee