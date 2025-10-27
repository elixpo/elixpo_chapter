'use client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { Bot, FileText, Loader2, Power, PowerOff } from 'lucide-react'
import React, { useState } from 'react'
import AIChatSlider from './AIChatSlider'


interface AIAgentCompoentsProps { 
    isEnabled?: boolean
    onToggle: (value: boolean) => void;
    suggestionOnLoading?: boolean
    loadingProgress?: number
    activeFeature?: string

}
const AIAgentCompoents = ({
  suggestionOnLoading,
  activeFeature,
  isEnabled,
  loadingProgress=0,
  onToggle
}: AIAgentCompoentsProps) => {
  const [isOpenChat, setIsOpenChat] = useState(false);
  return (
    <>
     <DropdownMenu>
       <DropdownMenuTrigger asChild>
          <Button style={{fontFamily: 'monospace'}} variant={'outline'} size={'sm'} className={cn(
             isEnabled ? "" : ""
          )}>
           {
            suggestionOnLoading ? (
              <Loader2 className='size-4 animate-spin'/>
            ) : (
              <Bot className='size-4'/>
            )
           }
          FingAI
          {
            isEnabled ? (
             <div className='w-2 h-2 rounded-full bg-green-400 animate-pulse' />
            ): (
              <div className='w-2 h-2 rounded-full bg-red-400 animate-pulse' />
            )
          }
            
          </Button>
       </DropdownMenuTrigger>
       <DropdownMenuContent align='end' className='w-80' >
         <DropdownMenuLabel className='flex justify-between items-center '>
             <div className='flex items-center gap-2'>
              <Bot className='size-5' />
              <span className='font-mono font-black'>FingAI.</span>
             </div>

             <Badge
            className={
              cn(
                isEnabled ? "bg-green-400 font-mono text-black" : "bg-red-400 font-mono text-black"
              )
            }
             variant={'outline'}>
              {
                isEnabled ? "Active" : "Inactive"
              }
             </Badge>
         </DropdownMenuLabel>
          {suggestionOnLoading && activeFeature && (
            <div className="px-3 pb-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{activeFeature}</span>
                  <span>{Math.round(loadingProgress)}%</span>
                </div>
                <Progress 
                  value={loadingProgress} 
                  className="h-1.5"
                />
              </div>
            </div>
          )}
          <DropdownMenuSeparator/>
       <DropdownMenuItem className="py-1 focus:bg-transparent" onSelect={(e) => e.preventDefault()}>
  <div className="flex items-center justify-between w-full px-2 py-1.5">
    <div className="flex items-center gap-3">
      {isEnabled ? (
        <Power className="size-4 text-green-500" />
      ) : (
        <PowerOff className="size-4 text-gray-500" />
      )}
      <div>
        <p className="font-mono text-sm">
          AI Assistant
        </p>
        <p className="text-xs font-mono opacity-60">
          {isEnabled ? "Click to disable" : "Click to enable"}
        </p>
      </div>
    </div>
    <Switch
      checked={isEnabled}
      onCheckedChange={onToggle}
    />
  </div>
</DropdownMenuItem>
    <DropdownMenuSeparator/>

     <DropdownMenuItem 
            onClick={() => setIsOpenChat(true)}
            className="py-2.5 cursor-pointer"
          >
            <div className="flex items-center gap-3 w-full">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-sm font-mono font-medium">Open Chat</div>
                <div className="text-xs font-mono text-muted-foreground">
                  Chat with AI assistant
                </div>
              </div>
            </div>
          </DropdownMenuItem>
       </DropdownMenuContent>
     </DropdownMenu>

     <AIChatSlider
      isOpen={isOpenChat}
      onClose={() => setIsOpenChat(false)}
     />
    </>
  )
}

export default AIAgentCompoents