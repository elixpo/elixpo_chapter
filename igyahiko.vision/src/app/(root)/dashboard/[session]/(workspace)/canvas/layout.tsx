import Toolbar from '@/components/canvas/toolbar'
import React from 'react'
interface Props{
     children: React.ReactNode
}
const Layout = ({children}: Props) => {
  return (
    <div className='w-full' >
        {children}
        <Toolbar/>
    </div>
  )
}

export default Layout