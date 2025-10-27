'use client'
import { useQuery } from 'convex/react';
import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import React from 'react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { CircleQuestionMark, Hash, LayoutTemplate, User } from 'lucide-react';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { UseAuth } from '@/hooks/use-auth';
import { useAppSelector } from '@/redux/store';
import CreateProjectButton from '../button/create/CreateProjectButton';
import { cn } from '@/lib/utils';

const Navbar = () => {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const {handleSignOut} = UseAuth()
  const projectId = params.get('project');
  
  const me = useAppSelector((state) => state.profile)
  const project = useQuery(
    api.projects.getProjects,
    projectId ? {projectId: projectId as Id<'projects'>} : "skip"

  )
  const currentTab = pathname.includes('canvas')
    ? 'canvas'
    : pathname.includes('style-guide')
    ? 'style-guide'
    : '';
 
  const handleTabChange = (value: string) => {
  const query = projectId ? `?project=${projectId}` : '';
  const session = me?.name || 'guest'; // or however you get session/user name

  if (value === 'canvas') {
    router.push(`/dashboard/${session}/canvas${query}`);
  }

  if (value === 'style-guide') {
    router.push(`/dashboard/${session}/style-guide${query}`);
  }
};

  const hasCanvas = pathname.includes('canvas')
  const hasCanvasStyleGuide = pathname.includes('style-guide')
  
  return (
    <div className=" grid grid-cols-2 lg:grid-cols-3 p-5  ">
      <div className="flex items-center gap-3">
        <Link
          href={`/dashboard/${me.name}`}
          className="dark:border-white dark:border-2 rounded-full h-6 w-6 bg-black justify-center items-center flex"
        >
          <div className="rounded-full h-3 w-3 bg-white" />
        </Link>
        {(currentTab === 'canvas' || currentTab === 'style-guide') && (
          <span className="font-mono text-xs lg:inline-block hidden backdrop-blur-xl dark:bg-white/[0.18] saturate-150 px-4 py-2 rounded-full dark:text-primary/60 dark:border-white/20">
            Projects/{project?.name}
          </span>
        )}
      </div>

      {/* Animated shadcn Tabs */}
     <div className='hidden md:block'>
       <div className="flex items-center justify-center ">
        <Tabs className='' value={currentTab} onValueChange={handleTabChange}>
          <TabsList className="relative flex  rounded-full dark:bg-white/10 gap-5    ">
            {['canvas', 'style-guide'].map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className={cn(
                   'flex items-center gap-2 rounded-2xl px-5 py-4 text-sm font-medium transition-all duration-300',
                   'bg-[#0f0f0f] text-white hover:bg-[#1a1a1a] border border-transparent',
                   // Active state = 3D pressed effect
                   'data-[state=active]:bg-[#0c0c0c] data-[state=active]:border-white/10',
                   'data-[state=active]:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-2px_-2px_6px_rgba(255,255,255,0.07),0_1px_4px_rgba(0,0,0,0.6)]',
                   // optional glow edge when active
                   'data-[state=active]:after:content-[""] data-[state=active]:after:absolute data-[state=active]:after:inset-0 data-[state=active]:after:rounded-2xl data-[state=active]:after:border data-[state=active]:after:border-white/5 data-[state=active]:after:shadow-[0_0_8px_rgba(255,255,255,0.04)] relative font-mono'
                 )}
              >
                {tab === 'canvas' && <Hash className="h-4 w-4" />}
                {tab === 'style-guide' && <LayoutTemplate className="h-4 w-4" />}
                {tab === 'canvas' ? 'Canvas' : 'Style Guide'}
                
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
     </div>

      {/* credits */}
    <div className="flex items-center justify-end gap-3">
  {/* credits text */}
  <span className="font-mono text-sm text-muted-foreground">Credits</span>

  {/* help / info button */}
  <Button
    size="icon"
    variant="secondary"
    className="h-8 w-8 rounded-full flex items-center justify-center"
  >
    <CircleQuestionMark className="h-4 w-4" />
  </Button>

  {/* avatar */}
  <Avatar className="h-8 w-8">
    <AvatarImage src={me.image || ''} />
    <AvatarFallback>
      <User className="h-4 w-4" />
    </AvatarFallback>
  </Avatar>

  {
    !hasCanvas && !hasCanvasStyleGuide && 
      (
       <CreateProjectButton/>
      )
    
  }
</div>

    </div>
  );
};

export default Navbar;
