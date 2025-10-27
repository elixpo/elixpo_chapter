'use client';

import React, { useRef, useLayoutEffect, useCallback } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const ScrollZoomVideo = () => {
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const circleRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<GSAPAnimation | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!circleRef.current) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - (circleRef.current.offsetWidth / 2);
    const y = e.clientY - rect.top - (circleRef.current.offsetHeight / 2);

    if (animationRef.current) animationRef.current.kill();
    
    animationRef.current = gsap.to(circleRef.current, {
      x,
      y,
      duration: 0.3,
      ease: 'power2.out'
    });
  }, []);

  useLayoutEffect(() => {
    if (!videoContainerRef.current) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        videoContainerRef.current,
        {
          scale: 0.9,
          width: '80%',
        },
        {
          scale: 1.05,
          width: '100%',
          scrollTrigger: {
            trigger: videoContainerRef.current,
            start: 'top bottom',
            end: 'top center+=100',
            scrub: true,
          },
          ease: 'power2.out',
        }
      );

      gsap.to(videoContainerRef.current, {
        scale: 0.9,
        width: '80%',
        scrollTrigger: {
          trigger: videoContainerRef.current,
          start: 'center+=100 center',
          end: 'bottom top',
          scrub: true,
        },
        ease: 'power2.in',
      });
    }, videoContainerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div className="flex justify-center mt-7 md:mt-10 md:my-10">
      <div
        ref={videoContainerRef}
        className="overflow-hidden rounded-xl shadow-xl transition-all duration-500 ease-in-out relative cursor-pointer"
        onMouseMove={handleMouseMove}
      >
        <div
          ref={circleRef}
          className="absolute z-30 pointer-events-none w-20 h-20 bg-white text-black font-bold rounded-full flex items-center justify-center opacity-90 shadow-lg"
          style={{ 
            left: 0,
            top: 0,
            mixBlendMode: 'difference',
            transform: 'translate(-100px, -100px)'
          }}
        >
          Fing
        </div>

        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
        >
          <source src="/assets/videos/fing.mp4" type="video/mp4" />
        </video>
      </div>
    </div>
  );
};

export default ScrollZoomVideo;