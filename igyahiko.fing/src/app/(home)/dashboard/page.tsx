"use client"
import React from 'react'
import DashboardLayout from './DashboardLayout'
import AddProjectButton from './components/AddProjectButton'
import AddRepoButton from './components/AddRepoButton'
import Image from 'next/image'
import { IMAES } from '../../../../public/assets/images/images'
import { useTRPC } from '@/trpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ProjectTable from './components/ProjectTable'
import { toast } from 'sonner'
import { Templates } from '@/generated/prisma'
import { PlayGroundProjects } from './types/types'
import HeaderLoader from '@/components/loader/HeaderLoader'

const Dashboard =  () => {
 const trpc = useTRPC();
 const queryClient = useQueryClient();
  // Fetch playgrounds with proper typing
  const { data: playgrounds, isLoading, error } = useQuery(
    trpc.playground.getAllPlaygrounds.queryOptions()
  );
  

  // Properly typed delete mutation
  const deleteProjectById = useMutation({
    ...trpc.playground.deleteProjectById.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries(
        trpc.playground.getAllPlaygrounds.queryOptions()
      );
      toast.success('Project deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete project', {
        description: error.message
      });
    }
  });
  const editProjectById = useMutation({
  ...trpc.playground.editProjectById.mutationOptions(),
  onSuccess: () => {
    queryClient.invalidateQueries(
      trpc.playground.getAllPlaygrounds.queryOptions()
    );
    toast.success('Project edited successfully');
  },
  onError: (error) => {
    toast.error('Failed to edit project', {
      description: error?.message
    }); 
  }
});
  const duplicateProject = useMutation({
  ...trpc.playground.duplicateProjectById.mutationOptions(),
  onSuccess: () => {
    queryClient.invalidateQueries(
      trpc.playground.getAllPlaygrounds.queryOptions()
    );
    toast.success('Project duplicated successfully');
  },
  onError: (error) => {  // Properly typed error parameter
    toast.error('Failed to duplicate project', {
      description: error.message || 'An unknown error occurred'
    });
  }
});

const handleEdit = (projects: PlayGroundProjects) => {
  editProjectById.mutate({ 
     id: projects.id,
     title: projects.title,
     describtion: projects.describtion,
     template: projects.template as Templates
  });
};
  const handleDelete = (id:string) => {
     deleteProjectById.mutate({id})
  }

 const handleDuplicate = (project: PlayGroundProjects) => {
  duplicateProject.mutate({ id: project.id });
};
  return (
    <DashboardLayout>
      <section className="">
        <div className="container max-w-7xl px-4 md:px-8">
          <div className="flex flex-col items-center justify-center py-10 w-full">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
              <AddProjectButton />
              <AddRepoButton />
            </div>

            <div className='mt-10 md:mt-20 flex flex-col justify-center items-center w-full'>
              {isLoading ? (
                <HeaderLoader />
              ) : error ? (
                <p className="text-red-500">Failed to load projects</p>
              ) : playgrounds && playgrounds.length === 0 ? (
                <EmptyState />
              ) : (
                <ProjectTable
                  projects={playgrounds || []}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  onUpdate={handleEdit}
                />
              )}
            </div>
          </div>
        </div>
      </section>
    </DashboardLayout>
  )
}

export default Dashboard


const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-16">
    <Image src={IMAES.Star} alt="No projects" className="w-56  h-56 mb-4" />
    <h2 style={{fontFamily: "poppins"}} className="text-xl md:text-4xl  font-bold ">No projects found</h2>
    <p className="text-gray-400 text-xs md:text-xl font-mono">Create a new project to get started!</p>
  </div>
)