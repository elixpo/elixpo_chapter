'use client';

import React from 'react';
interface Props {
     children: React.ReactNode
}

export default function GlowingGradientText({children}: Props) {
  return (
    <>
      <h1 style={{fontFamily: "monospace"}} className="text-xs md:text-2xl font-extrabold dark:text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-blue-500 to-pink-500 animate-gradientShift">
       {children}
      </h1>

      {/* Inline style tag for animation */}
      <style> 
        {`
          @keyframes gradientShift {
            0% {
              background-position: 0% 50%;
            }
            50% {
              background-position: 100% 50%;
            }
            100% {
              background-position: 0% 50%;
            }
          }

          .animate-gradientShift {
            background-size: 200% 200%;
            animation: gradientShift 5s ease infinite;
          }

          .glow-gradient {
            text-shadow: 0 0 20px rgba(255, 0, 255, 0.6),
                         0 0 30px rgba(0, 255, 255, 0.4);
          }
        `}
      </style>
    </>
  );
}
