import { Button } from '@/components/ui/button'
import { Fragment } from '@/generated/prisma'
import { ExternalLinkIcon, RefreshCcw } from 'lucide-react'
import React, { useState } from 'react'
import { toast } from 'sonner'
import Hint from './Hint'


interface Props {
     data: Fragment | null
}
const FragmentView = ({data}: Props) => {
  const [  ,setCopy] = useState(false);
  const [fragKey,setFragKey] = useState(0)

  const onReFresh = () => {
     setFragKey((prev) => (prev + 1))
  };

  const handleCopy = () => {
  if (!data?.sandboxUrl) return;

  navigator.clipboard.writeText(data.sandboxUrl)
    .then(() => {
      toast.success("Sandbox URL copied!");
      setCopy(true);
      setTimeout(() => setCopy(false), 2000);
    })
    .catch(() => {
      toast.error("Failed to copy URL");
    });
};


  return (
    <div className='flex flex-col h-full w-full'>
     <div className='p-2  border-b bg-sidebar flex gap-x-2 items-center'>
       <Hint side='bottom' align='start' message='Refresh'>
         <Button
         size='sm'
         variant='outline'
         onClick={onReFresh}
        >
         <RefreshCcw/>
        </Button>
       </Hint>
        <Hint message='click to copy'>
            <Button
         size='sm'
         className='flex-1 justify-start text-start font-normal'
         variant='outline'
         onClick={handleCopy}
         disabled={false}
        >
            <span className='truncate'>{data?.sandboxUrl}</span>
        </Button>
        </Hint>
         <Hint side='bottom' align='start' message='Open in a new tab'>
            <Button
         size='sm'
         onClick={() => {
            if(!data?.sandboxUrl) return;
            window.open(data.sandboxUrl, '_blank')
         }}
         disabled={!data?.sandboxUrl}
         variant='outline'
        >
         <ExternalLinkIcon/>
        </Button>
         </Hint>
        
     </div>
      <iframe
       key={fragKey}
       className='h-full w-full'
       sandbox='allow-form allow-scripts allow-same-origin'
       loading='lazy'
       src={data?.sandboxUrl}
      />
    </div>
  )
}

export default FragmentView