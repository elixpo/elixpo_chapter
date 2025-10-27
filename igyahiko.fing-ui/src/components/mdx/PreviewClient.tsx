"use client"
import React from 'react'
import RefreshButton from './RefreshButton'
import {Preview} from './Preview';


interface PreviewClientProps {
   children: React.ReactNode;
   className: string;
   isPreminum?: boolean;
   link: string;
   useIframe?: boolean;
   height?: number;
   compact?: boolean;
   comment?: string[];
}
export const PreviewClient = (
 props : PreviewClientProps
) => {
  const [key,setKey] = React.useState(0);
  const handleRefresh = () => {
     setKey((prev) => prev + 1);
  }
  return (
    <div>
       <RefreshButton  onRefresh={handleRefresh} />
       <div key={key} >
         <Preview {...props} />
       </div>
    </div>
  )
}

