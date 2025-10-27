import React from 'react'
import Navbar from './components_for_home/Navbar'


interface Props {
     children: React.ReactNode
}
const Layout = ({ children }: Props) => {
  return (
     <main className="flex  flex-col min-h-screen  max-h-screen relative ">
  {/* Full-page dotted background */}
  

  {children}
</main>
  )
}

export default Layout