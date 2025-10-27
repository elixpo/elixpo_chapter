import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { Hash, Icon, LayoutIcon, Type } from 'lucide-react'
import React from 'react'
interface Props {
     children: React.ReactNode
}
const Layout = ({children}: Props) => {
  const tabs = [
     {
         value: "colors",
         label: "Colors",
         icon: Hash,
     },
      {
         value: "typography",
         label: "Typography",
         icon: Type,
     },
      {
         value: "moodboard",
         label: "Moodboard",
         icon: LayoutIcon,
     }
  ] as const
  return (
    <Tabs>
     <div className='container mx-auto px-4 sm:px-6 py-6 sm:py-8'>
        <div>
            <div className='flex flex-col lg:flex-row gap-4 lg:gap-5 items-center justify-between'>
              <div>
                 <h1  style={{fontFamily: "var(--font-montserrat-alternates)"}} className='font-black text-4xl md:text-6xl text-center lg:text-left'>Style Guide</h1>
                 <p className='font-mono mt-1 lg:text-left text-center text-xs md:text-lg'>Manage Your style guide for your projects</p>
              </div>

              <TabsList className='grid w-full sm:w-fit h-auto grid-cols-3 rounded-full backdrop-blur-xl bg-white/[0.08] gap-3 border-white/[0.12] saturate-150 p-2'>
                {
                    tabs.map((t) => {
                        const Icon = t.icon
                         return (
                           <TabsTrigger
  key={t.value}
  value={t.value}
   className={cn(
    'flex items-center gap-2  rounded-2xl font-mono px-5 py-2 text-sm font-medium transition-all duration-300',
    'bg-[#0f0f0f] text-white hover:bg-[#1a1a1a] border border-transparent',
    // Active state = 3D pressed effect
    'data-[state=active]:bg-[#0c0c0c] data-[state=active]:border-white/10',
    'data-[state=active]:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-2px_-2px_6px_rgba(255,255,255,0.07),0_1px_4px_rgba(0,0,0,0.6)]',
    // optional glow edge when active
    'data-[state=active]:after:content-[""] data-[state=active]:after:absolute data-[state=active]:after:inset-0 data-[state=active]:after:rounded-2xl data-[state=active]:after:border data-[state=active]:after:border-white/5 data-[state=active]:after:shadow-[0_0_8px_rgba(255,255,255,0.04)] relative'
  )}
>
  <Icon className="h-4 w-4" />
  <span className="hidden sm:inline">{t.label}</span>
  <span className="sm:hidden">{t.value}</span>
</TabsTrigger>

                         )
                    })
                }
              </TabsList>
            </div>
        </div>
        <div className='container mx-auto px-4 sm:px-6 md:px-0 py-6 sm:py-8'>
            {children}
        </div>
     </div>
    </Tabs>
  )
}

export default Layout