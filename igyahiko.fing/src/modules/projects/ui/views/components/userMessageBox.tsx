import { Card } from '@/components/ui/card'
import React from 'react'

interface Props {
     content: string,
     createdAt: Date    
}
const UserMessageBox = (props: Props) => {
  return (
   <div className='flex justify-end pb-4 pt-5 pr-2 pl-5'>
   <Card className='border-none shadow-none p-3 max-w-[80%] break-words bg-muted'>
    <div className='flex flex-col gap-1'>
      <h1 className='text-md' style={{fontFamily: "poppins"}}>  {props.content}</h1>
    <p className="text-xs text-right" style={{ fontFamily: "monospace" }}>
  {props.createdAt.toLocaleString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    day: 'numeric'
  })}
</p>
    </div>
   </Card>
  
   </div>
  )
}

export default UserMessageBox