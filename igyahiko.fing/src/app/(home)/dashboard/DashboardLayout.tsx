"use client"
import { SidebarProvider } from '@/components/ui/sidebar'
import DashBoardSideBar from './components/DashBoardSideBar'
import { useTRPC } from '@/trpc/client'
import { useQuery } from '@tanstack/react-query'

interface Props {
     children: React.ReactNode
}
const DashboardLayout = ({children}: Props) => {
  
  const TechStackIconMap:Record<string, string> = {
    REACT: "Zap",
    NEXTJS: "Lightbulb",
    EXPRESS: "Database",
    HONO: "FlameIcon",
    ANGULAR: "Terminal",
    VUE: "Compass",

  }
  const trpc = useTRPC();
  const {data: PlayGroundData} = useQuery(trpc.playground.getAllPlaygrounds.queryOptions());
  
  const formattedData = PlayGroundData?.map((playground) => ({
     id: playground.id,
     name: playground.title,
     starred: playground.startMark?.[0]?.isMarked || false,
     icon: TechStackIconMap[playground.template] || "Code2",
  })) || [];

  return (
   <SidebarProvider>
    <div className='flex min-h-screen w-full overflow-x-hidden' >
       {/*  TODO:Dashboard implement */}
       <DashBoardSideBar  initialPlayground={formattedData} />

        <main className='px-10 '>{children}</main>
    </div>

   </SidebarProvider>
  )
}

export default DashboardLayout