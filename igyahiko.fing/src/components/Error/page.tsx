// app/not-found.js
'use client'; // Required for Framer Motion

import { motion } from 'framer-motion';
import Image from 'next/image';
import { logos } from '../../../public/assets/images/images';

export default function GlobalError() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-10 text-center"
    >
      <motion.div
        className='flex items-center'
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.7 }}
      >
        <Image alt='' src={logos.logo7} className='object-contain w-32 h-32 '  />
        <div style={{fontFamily: "poppins"}} className="text-7xl font-bold mb-2">FingAI.</div>
      </motion.div>

      <motion.div
       style={{fontFamily: "monospace"}}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="text-[200px] mt-10  font-bold  "
      >
        4 0 4
      </motion.div>

      <motion.p
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="max-w-2xl font-mono mb-10"
      >
        The Page You&apos;re Looking for Can&apos;t be Found. It&apos;s Looks Like You&apos;re Trying to Access a Page That Either Has Been Deleted or Never Existed...
      </motion.p>

      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        className="font-bold mb-10 font-mono underline cursor-pointer"
      >
        HOME PAGE
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.5 }}
        className="text-sm text-gray-400"
      >
        © 2025 FingAI. All rights reserved.
      </motion.div>
    </motion.div>
  );
}