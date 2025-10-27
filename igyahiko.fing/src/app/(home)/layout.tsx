import React from 'react'
interface Props {
     children: React.ReactNode
}
const Layout = ({children}: Props) => {
  return (
  <main className="flex  flex-col min-h-screen max-h-screen relative">
  {/* Full-page dotted background */}
  <div className="fixed inset-0 -z-10 w-full h-full
    bg-[radial-gradient(circle,rgba(0,0,0,0.05)_1px,transparent_1px)]
    dark:bg-[radial-gradient(circle,rgba(255,255,255,0.06)_1px,transparent_1px)]
    [background-size:18px_18px]" 
  />

  {children}
</main>

  )
}

export default Layout