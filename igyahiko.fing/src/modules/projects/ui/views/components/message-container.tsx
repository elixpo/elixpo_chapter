import { useTRPC } from '@/trpc/client'
import { useSuspenseQuery } from '@tanstack/react-query'
import React, { useEffect, useRef } from 'react'
import MessageCard from './messageCard'
import MessageForm from './messageForm'
import { Fragment } from '@/generated/prisma'
import MessageLoader from './MessageLoader'

interface Props {
     projectId: string,
     activeFragment: Fragment | null,
     setActiveFragment: (fragment: Fragment | null) => void;
     selectedModel: string;
}
const MesssageContainer = (props: Props) => {
  const {activeFragment,setActiveFragment} = props
  const bottomRef = useRef<HTMLDivElement>(null);
  const trpc = useTRPC()
  const {data: message} = useSuspenseQuery(trpc.messages.getMany.queryOptions({
     projectId:props.projectId
  },{
    //TODO: Temp live msg update
    refetchInterval: 5000
  }

))
  useEffect(() => {
  const lastAssisMsgFrag = message.findLast(
    (msg) => msg.role === 'ASSISTANT' && !!msg.fragment
  );

  if (lastAssisMsgFrag) {
    setActiveFragment(lastAssisMsgFrag.fragment);
  }
}, [message, setActiveFragment]);


  useEffect(() => {
     bottomRef.current?.scrollIntoView();
  },[message.length]);

  const lastMessage = message[message.length-1];
  const isLastMsgUser = lastMessage?.role === "USER"
  return (

    <div className='flex flex-col flex-1 min-h-0'>  
       <div className='flex-1 min-h-0 overflow-y-auto'>
          <div className='pt-2 pr-1'>
             {
                message.map((msg) => (
                    <MessageCard 
                     key={msg.id}
                     content={msg.content}
                     createdAt={msg.createdAt}
                     fragment={msg.fragment}
                     isActiveFragment={activeFragment?.id === msg.fragment?.id}
                     onFragmentClick={() => setActiveFragment(msg.fragment)}
                     role={msg.role}
                     type={msg.type}

                    />
                ))
             }
             {
                isLastMsgUser && <MessageLoader/>
             }
             <div ref={bottomRef} />
          </div>
       </div>
       <div className='relative p-3 pt-1'>
        <div className='absolute -top-6 left-0 right-0 h-6 bg-gradient-to-b from-transparent to-background/70 pointer-events-none' />
        <MessageForm projectId={props.projectId} selectedModel={props.selectedModel}  />
       </div>
    </div>
  )
}

export default MesssageContainer