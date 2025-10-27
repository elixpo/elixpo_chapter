import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useTRPC } from '@/trpc/client'
import {  useSuspenseQuery } from '@tanstack/react-query'
import Image from 'next/image'
import React from 'react'
import { logos } from '../../../../../../public/assets/images/images'
import { Check, ChevronDown, ChevronLeftIcon, SunMoonIcon } from 'lucide-react'
import Link from 'next/link'
import { DropdownMenuRadioGroup } from '@radix-ui/react-dropdown-menu'
import { useTheme } from 'next-themes'

interface ProjectHeaderProps {
  projectId: string,
  selectedModel: string;
  setSelectedModel: (model: string) => void;  // Keep as string
}

const ProjectHeader = ({ projectId, selectedModel, setSelectedModel }: ProjectHeaderProps) => {
  const trpc = useTRPC()
  const {data: project} = useSuspenseQuery(trpc.projects.getOne.queryOptions({id: projectId}))
  const {setTheme, theme} = useTheme();

  // Map of display names to actual model identifiers
  const modelOptions = [
    { display: "OpenAI GPT-4.1", value: "gpt-4.1" },
    { display: "Gemini 2.0 Flash Lite", value: "gemini-2.0-flash-lite" },
    { display: "OpenAI GPT-4o", value: "gpt-4o" },
    { display: "Gemini 1.5 Flash", value: "gemini-1.5-flash" }
  ];

  // Find the display name for the current selectedModel
  const getDisplayName = (modelValue: string) => {
    return modelOptions.find(opt => opt.value === modelValue)?.display || modelValue;
  };

  return (
    <header className='flex justify-between bg-sidebar p-2 border-b'>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size='sm'
            variant='ghost'
            className='focus-visible:ring-0 hover:bg-transparent hover:opacity-75 transition-opacity pl-2'
          >
            <Image alt='Fing' src={logos.logo7} className='w-6 h-6 object-contain' />
            <span className='text-md font-mono'>{project.name}</span>
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side='bottom'>
          <DropdownMenuItem asChild>
            <Link href="/">
              <ChevronLeftIcon/>
              <span className='font-mono'>Go to Home</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator/>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className='gap-2'>
              <SunMoonIcon className='size-4 text-muted-foreground'/>
              <span className='text-xs font-mono'>Appearance</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                  <DropdownMenuRadioItem value='light'>
                    <span className='font-mono text-xs'>Light</span>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value='dark'>
                    <span className='font-mono text-xs'>Dark</span>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value='system'>
                    <span className='font-mono text-xs'>System</span>
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="focus-visible:ring-0 hover:bg-transparent hover:opacity-75 transition-opacity pl-2"
          >
            <span className="text-md font-mono">{getDisplayName(selectedModel)}</span>
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-full">
          {modelOptions.map((model) => (
            <DropdownMenuItem
              key={model.value}
              onClick={() => setSelectedModel(model.value)}
              className={`font-mono flex justify-between items-center ${
                selectedModel === model.value ? "bg-muted" : ""
              }`}
            >
              {model.display}
              {selectedModel === model.value && <Check className="ml-2 h-4 w-4 text-green-500" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}

export default ProjectHeader