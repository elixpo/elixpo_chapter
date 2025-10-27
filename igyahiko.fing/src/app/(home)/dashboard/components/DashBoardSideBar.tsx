'use client'
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupAction, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail } from '@/components/ui/sidebar';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import React, { useState } from 'react'
import { logos } from '../../../../../public/assets/images/images';
import Link from 'next/link';
import {  Code2, Compass, Database, FlameIcon, FolderPlus, History, HomeIcon, LayoutDashboardIcon, LucideIcon, Plus, Settings, Star, Terminal, Zap } from 'lucide-react';
import { useTRPC } from '@/trpc/client';
import { useQuery } from '@tanstack/react-query';

interface Props {
   id?: string,
   name?: string,
   icon?: string,
   starred?: boolean
}

/* const initialPlayground: Props[] = []; */
const LucidIconsMap:Record<string, LucideIcon> = {
   Zap: Zap,
   Code: Code2,
   DataBase: Database,
   Compass: Compass,
   FlameIcon: FlameIcon,
   Terminal: Terminal
}

const DashBoardSideBar = ({initialPlayground}: {initialPlayground: Props[]}) => {
  
  const pathName = usePathname();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [starredPlayGrd,setStarredPlayGrd] = useState(initialPlayground.filter((p) => p.starred));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [recentPlayGround,setRecentPlayGround] = useState(initialPlayground);
  const trpc = useTRPC();
 const {data: playgrounds} = useQuery(trpc.playground.getAllPlaygrounds.queryOptions());
 

  return (
    <Sidebar variant='inset' collapsible='icon' className="border-r " >
       <SidebarHeader className='mx-auto'>
         <div className='flex items-center gap-0'>
          <Image alt='logo' src={logos.logo7} className='w-10 h-10 object-contain' />
          <span className='text-xl font-bold' style={{fontFamily: "poppins"}}>FingAI.</span>
         </div>
       </SidebarHeader>
       <SidebarContent className='mt-10'>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathName === '/'} tooltip={"Home"} >
                <Link href={"/"} >
                  <HomeIcon className='size-4'/>
                  <span className='font-mono text-md'>Home</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

             <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathName === '/dashboard'} tooltip={"dashboard"} >
                <Link href={"/dashboard"} >
                  <LayoutDashboardIcon className='size-4'/>
                  <span className='font-mono text-md'>Dashboard</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>



         <SidebarGroup>
          <SidebarGroupLabel>
            <Star className='size-4' />
            <span className='ml-2 font-mono' >Starred</span>
          </SidebarGroupLabel>
          <SidebarGroupAction title='Add Starred Playground'>
            <Plus className='size-4' />
          </SidebarGroupAction>

          <SidebarGroupContent>
            <SidebarMenu>
              {
                starredPlayGrd.length === 0 && recentPlayGround.length === 0 ? 
                 (<span className='font-mono text-xs text-muted-foreground text-center'>Create a Playground</span> ) :
                ( 
                   starredPlayGrd.map((playground) => {
                   const IconComp = LucidIconsMap[playground.icon as keyof typeof LucidIconsMap] ?? Code2;

                     return (
                       <SidebarMenuItem   key={playground.id} >
                        <SidebarMenuButton
                         asChild 
                         isActive={pathName === `/playground/${playground.id}`}
                        >
                           <Link
                            href={`/playground/${playground.id}`} >
                            {IconComp && <IconComp className='size-4' /> }
                          <span>
                            {playground.name}
                          </span>
                         </Link>
                        </SidebarMenuButton>
                       </SidebarMenuItem>
                     )
                   })
  
                )
              }
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>



        <SidebarGroup>
          <SidebarGroupLabel>
            <History className='size-4' />
            <span className='ml-2 font-mono' >Recent Projects</span>
          </SidebarGroupLabel>
          <SidebarGroupAction title='Add Starred Playground'>
            <FolderPlus className='size-4' />
          </SidebarGroupAction>

          <SidebarGroupContent>
            <SidebarMenu>
              {/* {
                starredPlayGrd.length === 0 && recentPlayGround.length === 0 ? 
                 null :
                ( 
                   starredPlayGrd.map((playground) => {
                   const IconComp = LucidIconsMap[playground.icon as keyof typeof LucidIconsMap] ?? Code2;

                     return (
                       <SidebarMenuItem   key={playground.id} >
                        <SidebarMenuButton
                         asChild 
                         isActive={pathName === `/playground/${playground.id}`}
                        >
                           <Link
                            href={`/playground/${playground.id}`} >
                            {IconComp && <IconComp className='size-4' /> }
                          <span>
                            {playground.name} 
                          </span>
                         </Link>
                        </SidebarMenuButton>
                       </SidebarMenuItem>
                     )
                   })
                   )} */}

                   {
                    playgrounds?.slice(0,4).map((playground) => {
                      return (
                      
                       <SidebarMenuButton
                        key={playground.id}
                       className=''>
                        <Link
                         href={`/playground/${playground.id}`}
                         >
                         <span className=' font-mono flex items-center gap-2'>
                          <Code2 className='size-3' />
                            {playground.title}
                         </span>
                         </Link>
                       </SidebarMenuButton>
                      
                      )
                    })
                   }
                   <SidebarMenuItem>
                    <SidebarMenuButton    asChild tooltip={'view all'}>
                       <Link  href={'/playground'} >
                       <span className='text-xs font-mono text-muted-foreground'>View all playground</span>
                       </Link>
                    </SidebarMenuButton>
                   </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
       </SidebarContent>

       <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton>
              <Link className='flex items-center gap-2' href={"/settings"} >
               <Settings className='size-4'/>
               <span className='text-xs font-mono '>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
       </SidebarFooter>
       <SidebarRail/>
    </Sidebar>
  )
}

export default DashBoardSideBar
