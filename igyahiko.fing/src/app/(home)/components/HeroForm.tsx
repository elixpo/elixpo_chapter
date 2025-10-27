'use client'
import React, { useState } from 'react'
import {z} from 'zod'
import {Form, FormField} from '@/components/ui/form'
import { useTRPC } from '@/trpc/client'
import { toast } from 'sonner'
import { zodResolver } from '@hookform/resolvers/zod';
import {useForm} from "react-hook-form"
import TextAreaAutoSize from 'react-textarea-autosize'
import { Button } from '@/components/ui/button'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { ArrowUp, Loader2Icon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { PROJECT_TEMPLATES } from '@/constant/constant'
import { useClerk } from '@clerk/nextjs'
import { useCurrentTheme } from '@/hooks/use-current-theme'
import {dark} from '@clerk/themes'


const formSchema = z.object({
    prompt: z.string()
            .min(1,{message: "Prompt is required"})
            .max(10000,{message: "value is  too long"})
            
})
const HeroForm = () => {
  const currTheme = useCurrentTheme();
  const {openSignIn} = useClerk()
  const router = useRouter()
  const [isFocused,setIsFocused] = useState(false);
  const trpc = useTRPC();
  const queryClient = useQueryClient()
 
  const form = useForm<z.infer<typeof formSchema>>({
     resolver: zodResolver(formSchema),
     defaultValues: {
         prompt:  ""
     }
  })
  const onSelect = (value:string) => {
     form.setValue("prompt",value,{
         shouldDirty: true,
         shouldTouch: true,
         shouldValidate: true
     })
  }
  
  const createProject = useMutation(trpc.projects.create.mutationOptions({
     onSuccess: (data) => {
          form.reset();
          queryClient.invalidateQueries(
            trpc.projects.getMany.queryOptions()
          );
          router.push(`/projects/${data.id}`)
         
          queryClient.invalidateQueries(
            trpc.usage.status.queryOptions()
          )
     },
     onError: (error) => {
        //TODO redirect to pricing page

         toast.error(error.message)
         if(error.data?.code === 'UNAUTHORIZED') {
           openSignIn({
             appearance: {
               baseTheme: currTheme === 'dark' ? dark : undefined,
               elements: {
                 card: ' shadow-none!  border-none!',
                   headerTitle: 'text-white  text-3xl! font-[poppins]! font-bold!',
                   headerSubtitle: "font-mono!  text-xs!",
                   formFieldInput: 'bg-white/10! py-6!',
                   formButtonPrimary: 'bg-pink-500! text-white! py-2.5! hover:bg-white/90',
                    socialButtonsBlockButton: "py-3!",
                    dividerText: 'text-white/60!',
                    footer: 'bg-transparent! hidden!  border-none! mt-5!',
                    footerAction: 'text-white text-xs font-mono',
                    footerActionLink: 'text-pink-500 hover:underline font-mono',
                    footerPoweredBy: 'text-pink-400 text-xs font-mono',
                    footerDeveloper: 'text-pink-500 text-xs font-mono! mt-1',

               }
             }
           })
         }

          if(error.data?.code === 'BAD_REQUEST') {
            router.push("/pricing")
         }
     }
  }))
  const isPending = createProject.isPending
  const isDisable = isPending || !form.formState.isValid
  const onSubmit = async (prompts:z.infer<typeof formSchema>) => {
     await createProject.mutateAsync({
        prompt: prompts.prompt,
    
     })
  }
  
  return (
   <Form {...form}>
     <form
     className={cn(
         "relative bg-sidebar border border-black/15 rounded-xl p-3  pt-1 dark:bg-white/15 dark:border-white/15 transition-all",
         isFocused && 'shadow-xs',
        

     )}
     onSubmit={form.handleSubmit(onSubmit)}>
   <FormField
     name='prompt'
     control={form.control}
     render={({field}) => (
         <TextAreaAutoSize
            {...field}
            disabled={isPending}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            minRows={2}
            maxRows={8}
            className={cn(
                "pt-2 px-1 border-none outline-none resize-none w-full bg-transparent placeholder:font-mono placeholder:text-xs"
            )}
            placeholder='What would you like to construct ?'
            onKeyDown={(e) => {
                 if(e.key === "Enter" && (e.ctrlKey || e.metaKey)){
                    e.preventDefault()
                    form.handleSubmit(onSubmit)(e)
                 }
            }}
         />
     )} 
    />
    <div className='flex gap-x-2 justify-between items-end'>
        <div className='font-mono text-[10px] flex items-center text-muted-foreground'>
          <kbd className='inline-flex select-none h-5 rounded   items-center gap-1 ml-auto pointer-events-none border border-black/15 bg-muted text-muted-foreground px-1.5 font-mono text-[10px]'>
            <span className='text-lg'>
                &#8984;
            </span>
            Enter
          </kbd>
           &nbsp; to submit
        </div>
        <Button
        disabled={isDisable}
        className={
            cn(
                "size-8 rounded-full",
                isDisable && "bg-muted-foreground border border-black/15"
            )
        }>
           {
            isPending ? (<Loader2Icon className='animate-spin size-4'/>) : (<ArrowUp/>)
           }
        </Button>
    </div>

     </form>
     <div className='flex-wrap gap-2 mt-5 md:ml-10  justify-center hidden md:flex max-w-3xl' >
        {PROJECT_TEMPLATES.map((data) => (
             <Button
              onClick={() => onSelect(data.prompt)}
              key={data.title}
              variant='outline'
              className='bg-white dark:bg-sidebar'
            >
              {data.emoji}  {data.title}
            </Button>
        ))}
     </div>
    </Form>
  )
}

export default HeroForm