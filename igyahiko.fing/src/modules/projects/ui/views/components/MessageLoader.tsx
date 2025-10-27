import Image from 'next/image';
import React, { useEffect, useState } from 'react'
import { logos } from '../../../../../../public/assets/images/images';

const TypingMessge = () => {
    const loadingMessages = [
  "Thinking...",
  "Generating response...",
  "Typing...",
  "Analyzing prompt...",
  "Cooking up code...",
  "Almost there...",
  "Compiling thoughts...",
  "Writing something smart...",
  "Finalizing message...",
  "Hang tight..."
];

const [index,setIndex] = useState(0);
useEffect(() => {
  const interval = setInterval(() => {
       setIndex((prev) => (prev + 1) % loadingMessages.length )
  },2000)
   
  return () => clearInterval(interval);
},[loadingMessages.length])
     return (
         <div>
         <span className='text-base text-muted-foreground font-mono animate-pulse'>{loadingMessages[index]}</span>
         </div>
     )
}




const MessageLoader = () => {


  return (
    <div className='flex flex-col group px-2 pb-4'>
        <div className='flex items-center gap-1'>
          <Image alt='fing' src={logos.logo7} className='w-6 h-6 object-contain' />
          <span className='text-md font-bold' style={{fontFamily: "monospace"}} >Fing</span>
        </div>
      <div className=' pl-8 gap-y-4 flex items-center'>
        <span>
            <TypingMessge/>
        </span>
      </div>
    </div>
  )
}

export default MessageLoader