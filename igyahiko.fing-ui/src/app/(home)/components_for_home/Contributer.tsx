'use client'

import { SparklesIcon } from 'lucide-react'
import Link from 'next/link'
import React, { useRef, useState } from 'react'
import {
  PopoverForm,
  PopoverFormButton,
  PopoverFormCutOutLeftIcon,
  PopoverFormCutOutRightIcon,
  PopoverFormSeparator,
  PopoverFormSuccess,
} from "@/components/ui/popover-form"
import { useScroll, useTransform, motion } from 'framer-motion'
import { Three3dPng } from '../../../../public/assets/images/images'
 

const Contributer = () => {

     const sectionRef = useRef(null)

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  })

  const translateY = useTransform(scrollYProgress, [0, 1], [150, -150]) 
    type FormState = "idle" | "loading" | "success"
      const [formState, setFormState] = useState<FormState>("idle")
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
 
  function submit() {
    setFormState("loading")
    setTimeout(() => {
      setFormState("success")
    }, 1500)
 
    setTimeout(() => {
      setOpen(false)
      setFormState("idle")
      setName("")
      setEmail("")
      setMessage("")
    }, 3300)
  }
  return (
    <section ref={sectionRef} className='py-0 md:py-20 overflow-x-clip relative'>
     <div className='container mx-auto'>
        <div className='flex flex-col items-center gap-y-5'>
            <div  className='flex items-center gap-2 rounded-2xl font-mono border px-4 py-1'>
             <SparklesIcon className='fill-[#EEBDE0] stroke-1 text-neutral-800' />
            <span>connect with Fing.</span>
         </div>


           <div className='grid grid-cols-1 md:grid-cols-2 py-0 md:py-20' >
           <div className='flex items-center md:items-start flex-col px-4 md:px-0'>
             <span  className='text-5xl text-center font-[poppins] md:text-left md:text-8xl font-black '><span className=''>Contribute.</span> <span className='dark:text-amber-200'>Collaborate.</span> <span className='text-blue-400'>Creat.</span></span>
            <p className='text-center md:text-left font-mono mt-4 text-xs md:text-xl '>
                Join the Fing Developer Community — Build the Future with Us (slightly extended, more powerful)
            </p>

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

           <div className='flex items-center justify-end   '>
              <PopoverForm
        title="Click to collaborate..."
        open={open}
        setOpen={setOpen}
        width="364px"
        height="372px"
        showCloseButton={formState !== "success"}
        showSuccess={formState === "success"}
        openChild={
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!name || !email || !message) return
              submit()
            }}
            className=" space-y-4 "
          >
            <div className="px-4 pt-4">
              <label
                htmlFor="name"
                className="block text-sm font-medium text-muted-foreground mb-1"
              >
                Name
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border  rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary bg-white dark:bg-black"
                required
              />
            </div>
            <div className="px-4">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-muted-foreground mb-1"
              >
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border  rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary bg-white dark:bg-black"
                required
              />
            </div>
            <div className="px-4">
              <label
                htmlFor="message"
                className="block text-sm font-medium text-muted-foreground mb-1"
              >
                Message
              </label>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary bg-white dark:bg-black"
                rows={3}
                required
              />
            </div>
            <div className="relative flex h-12 items-center px-[10px]">
              <PopoverFormSeparator />
              <div className="absolute left-0 top-0 -translate-x-[1.5px] -translate-y-1/2">
                <PopoverFormCutOutLeftIcon />
              </div>
              <div className="absolute right-0 top-0 translate-x-[1.5px] -translate-y-1/2 rotate-180">
                <PopoverFormCutOutRightIcon />
              </div>
              <PopoverFormButton
                loading={formState === "loading"}
                text="Submit"
              />
              
            </div>
          </form>
        }
        successChild={
          <PopoverFormSuccess
            title="Message Sent"
            description="Thank you for contacting us. We'll get back to you soon!"
          />
        }
      />
           </div>
         </div>
          <motion.img
                     src={Three3dPng.Three3d5.src}
                     alt=''
                     width={262}
                     height={262}
                     style={{ translateY }}
                     className='hidden md:block absolute right-0 top-32'
                   />
        </div>
    </div>
    </section>
  )
}

export default Contributer
