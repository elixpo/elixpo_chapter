import { preloadQuery } from 'convex/nextjs'
import { api } from '../../convex/_generated/api'
import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server'
import { ConvexUserRaw, normalizeProfile } from '@/types/user'
import { Id } from '../../convex/_generated/dataModel'

 export const ProfileQuery = async () => {
     return await preloadQuery(
        api.user.getCurrentUsers,
        {},
        {token: await convexAuthNextjsToken()}
     )
}

export const  SubscriptionEntitlementQuery = async () => {
     const rawProfile = await ProfileQuery()
     const  profile = normalizeProfile(
        rawProfile._valueJSON as unknown as ConvexUserRaw | null
     )

     const entitlement = await preloadQuery(
        api.subscriptions.hasEntitlement,
        {userId: profile?.id as Id<'users'>},
        {token: await convexAuthNextjsToken()}
     )
     return {entitlement, profileName: profile?.name}
}

export const ProjectsQuery = async () => {
    const rawProfile = await ProfileQuery();
    const profile = normalizeProfile(
      rawProfile._valueJSON as unknown as ConvexUserRaw | null
    )
    if(!profile?.id) { 
       return { project: null, profile: null}
    }

   const projects = await preloadQuery(
      api.projects.getUserProject,
      {userId: profile.id as Id<'users'>},
      {token: await convexAuthNextjsToken()}
   )
   return {
       profile,
       projects
   }
}


export const StyleGuideQuery = async (projectId: string) => {
    const styleGuide = await preloadQuery(
      api.projects.getProjectStyleGuide,
      {projectId: projectId as Id<'projects'>},
      {token: await convexAuthNextjsToken()}
    )

    return {styleGuide}

}

export const MoodBoardQuery = async (projectId: string) => {
       const imges = await preloadQuery(
         api.moodboard.getMoodBoardImages,
         {projectId: projectId as Id<'projects'>},
         {token: await convexAuthNextjsToken()}
       )
       return {imges}
}

export const ProjectQuery = async (projectId: string) => {
    const rawProfile = await ProfileQuery();
    const profile = normalizeProfile(
      rawProfile._valueJSON as unknown as ConvexUserRaw | null
    )
    if(!profile?.id || !projectId) { 
       return { project: null, profile: null}
    }

   const project = await preloadQuery(
      api.projects.getProjects,
      {projectId: projectId as Id<'projects'>},
      {token: await convexAuthNextjsToken()}
   )
   return {
       profile,
       project
   }
}