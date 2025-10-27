'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Image, { StaticImageData } from 'next/image';

interface Testimonial {
  username: string;
  designation: string;
  text: string;
  image: string |StaticImageData;
}

interface TestiColProps {
  data: Testimonial[];
  reverse?: boolean;
}

const TestiCol = ({ data, reverse = false }: TestiColProps) => {
  const scrollAnim = reverse ? ['-50%', '0%'] : ['0%', '-50%'];

  return (
    <div className="relative h-full overflow-hidden">
      <motion.div
        className="flex flex-col gap-5"
        animate={{ y: scrollAnim }}
        transition={{
          duration: 15,
          ease: 'linear',
          repeat: Infinity,
        }}
      >
        {data.map((item, i) => (
          <div 
          key={`${item.username}-${i}`}
          >
          <div className='p-6 flex flex-col border items-center gap-y-2.5 rounded-lg bg-muted dark:bg-sidebar'>
            <Image src={item.image} alt='' />
            <div className='flex flex-col items-center ' >
              <span className='font-mono'>
                @{item.username}
              </span>
              <h1 className='font-mono'>{item.designation}</h1>
              <h1 className='text-center font-mono text-xs mt-2'>{item.text}</h1>
            </div>
          </div>
          </div>
        ))}
      </motion.div>
    </div>
  );
};

export default TestiCol;
