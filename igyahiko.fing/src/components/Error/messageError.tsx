'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

export default function MessageError() {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white text-center px-4 font-mono">
      
      {/* 404 Logo */}
      <div className="flex text-[100px] md:text-[140px] font-bold items-center">
        <motion.span
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 100 }}
        >
          4
        </motion.span>

        {/* Animated Eye in Zero */}
        <motion.span
          className="mx-2 text-pink-400 relative"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.4, duration: 0.5, type: 'spring' }}
        >
          <div className="w-[60px] h-[60px] md:w-[80px] md:h-[80px] bg-pink-400 rounded-full flex items-center justify-center relative shadow-[0_0_40px_#D3FF2C55]">
            <motion.div
              className="w-[14px] h-[14px] md:w-[18px] md:h-[18px] bg-black rounded-full"
              animate={{
                scale: [1, 1.2, 1],
                y: [0, 2, 0]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut'
              }}
            />
          </div>
        </motion.span>

        <motion.span
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 100 }}
        >
          4
        </motion.span>
      </div>

      {/* Subheading */}
      <motion.p
        className="text-md md:text-xl mt-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        SORRY, THERE’S{' '}
        <span className="text-pink-400 font-bold">NOTHING HERE</span>
      </motion.p>

      {/* Button */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
      >
        <Link
          href="/"
          className="mt-6 inline-block bg-pink-400 text-black text-sm px-6 py-2 rounded hover:bg-pink-300 transition-all shadow-[0_0_20px_#D3FF2C55]"
        >
          GO HOME
        </Link>
      </motion.div>
    </div>
  );
}
