'use client';

import { Button } from '@/components/ui/button';
import { useTRPC } from '@/trpc/client';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import React, {  useState } from 'react';
import {  logos } from '../../../../public/assets/images/images';
import { useUser } from '@clerk/nextjs';

const ProjectsShowCase = () => {
  const trpc = useTRPC();
  const { data: projects } = useQuery(trpc.projects.getMany.queryOptions());
  const [showAll, setShowAll] = useState(false);
  const {user} = useUser()
  const visibleProjects = showAll ? projects : projects?.slice(0, 16);
  if(!user) return null

  return (
    <section className="py-0 md:py-10">
      <div className="container mx-auto relative">
        <div>
          <h1
            className="text-center text-4xl md:text-8xl font-bold"
            style={{ fontFamily: 'poppins' }}
          >
            {user?.firstName}&apos;s{' '}
            <span className="text-5xl md:text-8xl font-extrabold dark:text-transparent bg-clip-text dark:bg-gradient-to-r from-pink-500 via-purple-400 to-pink-500 glow-gradient animate-gradientShift">
              Fings
              <style>
                {`
                @keyframes gradientShift {
                  0% { background-position: 0% 50%; }
                  50% { background-position: 100% 50%; }
                  100% { background-position: 0% 50%; }
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
            </span>
          </h1>
          <p className="text-md mt-2 md:text-lg text-center font-mono">
            projects built with love and purpose
          </p>
        </div>

        <div className="flex flex-col items-center px-4">
          {/* Empty State */}
          {projects?.length === 0 && (
            <p className="text-center text-gray-500 mt-10">No Projects Found...</p>
          )}

          {/* Projects List */}
          <div className="flex flex-wrap justify-center gap-4 mt-8 w-full max-w-7xl">
            {visibleProjects?.map((data) => (
              <Button
                key={data.id}
                variant="ghost"
                className="w-full sm:w-[300px] border px-4 py-7 text-left"
              >
                <Link href={`/projects/${data.id}`} className="w-full">
                  <div className="flex items-center gap-3">
                    <Image
                      alt="logo"
                      className="object-contain"
                      height={40}
                      width={40}
                      src={logos.logo7}
                    />
                    <div className="flex flex-col items-start">
                      <h1 className="font-mono text-sm sm:text-base">{data.name}</h1>
                      <p className="text-xs text-gray-500">
                        {data.createdAt.toDateString()}
                      </p>
                    </div>
                  </div>
                </Link>
              </Button>
            ))}
          </div>

          {/* Show All Toggle Button */}
          {projects && projects.length > 16 && (
            <Button
              onClick={() => setShowAll((prev) => !prev)}
              className="mt-6 px-6 py-2"
              variant="secondary"
            >
              {showAll ? 'Show Less' : `Show All (${projects.length}) Projects`}
            </Button>
          )}
        </div>

       
            {/* <Image width={162} height={162} alt='' src={IMAES.Tube}  className='hidden md:block absolute right-70 -top-10 hover:rotate-12  duration-500' /> */}
           
      
      </div>
    </section>
  );
};

export default ProjectsShowCase;
