import { Fragment, MessageRole, MessageType } from '@/generated/prisma'
import React from 'react'
import UserMessageBox from './userMessageBox'
import AssistantCardBox from './AssistantCardBox'
interface Props {
    
     content: string,
     role: MessageRole,
     fragment: Fragment | null,
     createdAt: Date,
     isActiveFragment: boolean,
     onFragmentClick: (fragment: Fragment)=> void
     type: MessageType  
}
const MessageCard = (props: Props) => {
  return (
    <div>
        {
            props.role === 'ASSISTANT' ? (<AssistantCardBox  {...props} />) : (<UserMessageBox {...props} />)
        }
    </div>
  )
}

export default MessageCard