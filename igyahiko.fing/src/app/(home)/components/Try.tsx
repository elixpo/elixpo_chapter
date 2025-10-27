'use client';

import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

import {GoNorthStar} from 'react-icons/go'
const Try: React.FC = () => {
  const marqueeRef = useRef<HTMLDivElement | null>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    const marquee = marqueeRef.current;
    if (!marquee) return;

    // Infinite horizontal scroll
    tweenRef.current = gsap.to(marquee, {
      xPercent: -90,
      repeat: -1,
      ease: 'linear',
      duration: 20,
    });

    // Cleanup on unmount
    return () => {
      tweenRef.current?.kill();
    };
  }, []);

  const handleMouseEnter = () => {
    gsap.to(marqueeRef.current, { opacity: 0.5, duration: 0.3 });
    tweenRef.current?.timeScale(0.4);
  };

  const handleMouseLeave = () => {
    gsap.to(marqueeRef.current, { opacity: 1, duration: 0.3 });
    tweenRef.current?.timeScale(1);
  };

  return (
    <section className="pt-30 pb-40 overflow-hidden">
      <div
        className="relative w-full overflow-hidden"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex whitespace-nowrap w-max" ref={marqueeRef}>
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3  text-6xl md:text-8xl font-medium px-8"
              style={{ fontFamily: 'Poppins' }}
            >
              <GoNorthStar className="w-20 h-20 text-pink-400" />
              Try it for free
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Try;
