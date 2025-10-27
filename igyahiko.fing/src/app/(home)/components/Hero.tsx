'use client';

import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';


import HeroForm from './HeroForm';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import ScrollZoomVideo from './ScrollZoomVideo';


gsap.registerPlugin(ScrollTrigger);

interface HeroProps {
  darkMode?: boolean;
}

const Hero: React.FC<HeroProps> = () => {
  

  const [text, setText] = useState('');
  const [sloganIndex, setSloganIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);

  const videoWrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const slogans = [
    'Hack it. Prompt it. Launch it.',
    'Code less. Launch smarter.',
    'Generate. Push. Deploy.',
    'Prompt. Publish. Profit.'
  ];
    const current = slogans[sloganIndex];
    if (charIndex < current.length) {
      const timeout = setTimeout(() => {
        setText((prev) => prev + current[charIndex]);
        setCharIndex(charIndex + 1);
      }, 80);
      return () => clearTimeout(timeout);
    } else {
      const delay = setTimeout(() => {
        setText('');
        setCharIndex(0);
        setSloganIndex((prev) => (prev + 1) % slogans.length);
      }, 1800);
      return () => clearTimeout(delay);
    }
  }, [charIndex, sloganIndex]);

  

  useLayoutEffect(() => {
    if (!videoWrapperRef.current) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: videoWrapperRef.current,
          start: 'top center',
          end: 'bottom center',
          scrub: true,
          pin: true,
        },
      });

      tl.fromTo(
        videoWrapperRef.current,
        {
          scale: 1,
        },
        {
          scale: 1.6,
          ease: 'power2.inOut',
        }
      ).to(videoWrapperRef.current, {
        scale: 1,
        ease: 'power2.inOut',
      });
    }, videoWrapperRef);

    return () => ctx.revert();
  }, []);

  return (
    <section className="py-20 md:py-10 relative overflow-x-clip">
      <div className="container mx-auto">
        <div className="flex justify-center">
          <div
            className="inline-flex text-lg md:text-2xl py-1 px-4 rounded-full"
            style={{
              fontFamily: 'monospace',
              fontWeight: 500,
            }}
          >
            <h1 className="flex items-center">
              AI + Website builder
              <div className="ml-2 mr-2">
                <span className="opacity-100">/</span>
                <span className="opacity-50">/</span>
                <span className="opacity-30">/</span>
              </div>
              India
            </h1>
          </div>
        </div>

        <div className="flex items-center mt-4 px-2 md:px-0 flex-col text-center">
          <h1 className="text-3xl md:text-8xl font-bold" style={{ fontFamily: 'poppins' }}>
            <span className="text-5xl md:text-8xl font-extrabold dark:text-transparent bg-clip-text dark:bg-gradient-to-r from-pink-500 via-purple-400 to-pink-500 glow-gradient animate-gradientShift">
              FingAI.
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
            </span>{' '}
            ships it  anyway
          </h1>
          <h1 className="text-2xl md:text-7xl mt-2 font-bold" style={{ fontFamily: 'poppins' }}>
            {text}|
          </h1>
          <p className="text-xs md:text-md mt-5" style={{ fontFamily: 'monospace' }}>
            <span className="text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 bg-clip-text">
              FingAI
            </span>{' '}
            simplifies your{' '}
            <span className="text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 bg-clip-text">
              website creation
            </span>{' '}
            process with intelligent{' '}
            <span className="text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 bg-clip-text">
              design automation
            </span>{' '}
            and real-time optimization.
          </p>
          <p className="text-sm md:text-md" style={{ fontFamily: 'monospace' }}>
            From{' '}
            <span className="text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 bg-clip-text">
              layout generation
            </span>{' '}
            to{' '}
            <span className="text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 bg-clip-text">
              content suggestions
            </span>
            , everything is streamlined — no manual coding, no hassle.
          </p>
        </div>

        <div className="px-5 md:px-30 lg:px-52 mx-auto mt-5">
          <HeroForm />
        </div>

        {/* VIDEO SECTION WITH SCROLLING ZOOM */}
       <div className='flex justify-center px-10 md:px-0 items-center w-full'> 
       <ScrollZoomVideo/>
       </div>
      </div>
    </section>
  );
};

export default Hero;
