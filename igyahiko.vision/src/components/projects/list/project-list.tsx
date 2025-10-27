'use client'

import { UseProjectCreation } from '@/hooks/use-project'
import { useAppSelector } from '@/redux/store'
import { formatDistanceToNow } from 'date-fns'
import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

const ProjectList = () => {
  const { canCreate, projects } = UseProjectCreation()
  const user = useAppSelector((state) => state.profile)

  // 🧱 Auth guard
  if (!canCreate) {
    return (
      <div className='py-20 text-center'>
        <span className='text-lg'>
          Please sign in first to continue
        </span>
      </div>
    )
  }


  return (
    <div className='space-y-8 px-5 md:px-0'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 style={{fontFamily: 'var(--font-montserrat-alternates)'}} className='text-4xl md:text-5xl font-black'><span className='capitalize'>{user?.name}</span>'s Projects</h1>
          <span className='font-mono text-xs md:text-md text-muted-foreground'>
            Manage your design projects and continue where you left off.
          </span>
        </div>
      </div>

      {/* Project List */}
      <div>
        {projects.length === 0 ? (
          <div className='py-36 text-center'>
            <h1 className='font-extrabold text-2xl mb-2'>No Projects Yet!</h1>
            <p className='font-mono text-md text-muted-foreground'>
              Create your very first project real quick with VisionAI.
            </p>
          </div>
        ) : (
          <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6'>
            {projects.map((project: any) => (
              <Link
                key={project.id}
                href={`/dashboard/${user?.name}/canvas?project=${project.id}`}
                className='group cursor-pointer'
              >
                <div className='space-y-3'>
                  <div className='aspect-[4/3] rounded-lg overflow-hidden bg-muted transition-transform duration-300 group-hover:scale-[1.02]'>
                    {project.thumbnail && project.thumbnail.trim() !== '' ? (
                      <Image
                        alt={project.name || 'Project thumbnail'}
                        src={project.thumbnail}
                        width={300}
                        height={200}
                        className='object-cover w-full h-full'
                      />
                    ) : (
                      <div className='flex items-center justify-center w-full h-full text-sm text-muted-foreground'>
                        No Thumbnail
                      </div>
                    )}
                  </div>

                 <div className='flex items-center px-1 justify-between'>
                     <div>
                    <p className='font-semibold font-mono text-sm truncate capitalize'>
                      {project.name}
                    </p>
                    <p className='text-xs text-muted-foreground font-mono'>
                      Project #{project.projectNumber}
                    </p>
                  </div>
                   <p className='font-semibold opacity-60  font-[poppins] text-xs truncate'>
                    {
                        formatDistanceToNow(new Date(project?.lastModified),{
                            addSuffix: true 
                        })
                    }
                   </p>
                 </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ProjectList
