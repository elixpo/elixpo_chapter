import { SidebarProvider } from '@/components/ui/sidebar'
import React from 'react'


interface Props {
    children: React.ReactNode
}
const PlaygroundLayout = ({children}:Props) => {
  return (
  <SidebarProvider >
    {children}
  </SidebarProvider>
  )
}

export default PlaygroundLayout