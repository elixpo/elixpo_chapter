import React, { useState } from 'react'
import {z} from 'zod'
import {Form, FormField} from '@/components/ui/form'
import { useTRPC } from '@/trpc/client'
import { toast } from 'sonner'
import { zodResolver } from '@hookform/resolvers/zod';
import {useForm} from "react-hook-form"
import TextAreaAutoSize from 'react-textarea-autosize'
import { Button } from '@/components/ui/button'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { ArrowUp, Loader2Icon } from 'lucide-react'
import Usage from './usage'
import { useRouter } from 'next/navigation'



interface Props {
     projectId: string,
     selectedModel: string;
    
}

const formSchema = z.object({
    prompt: z.string()
            .min(1,{message: "Prompt is required"})
            .max(10000,{message: "value is  too long"})
            
})
const MessageForm = ({projectId,selectedModel}: Props) => {
  const [isFocused,setIsFocused] = useState(false);
  const trpc = useTRPC();
  const router = useRouter()
  const queryClient = useQueryClient()
  
  const form = useForm<z.infer<typeof formSchema>>({
     resolver: zodResolver(formSchema),
     defaultValues: {
         prompt:  ""
     }
  })
  const {data: usage} = useQuery(trpc.usage.status.queryOptions())
  const createMessage = useMutation(trpc.messages.create.mutationOptions({
     onSuccess: () => {
          form.reset();
          queryClient.invalidateQueries(
            trpc.messages.getMany.queryOptions({projectId})
          )
         queryClient.invalidateQueries(
           trpc.usage.status.queryOptions()
         )  
     },
     onError: (error) => {  
         toast.error(error.message)
         if(error.data?.code === 'BAD_REQUEST') {
            router.push("/pricing")
         }
     }
  }))
  const isPending = createMessage.isPending
  const isDisable = isPending || !form.formState.isValid
  const onSubmit = async (prompts:z.infer<typeof formSchema>) => {
     await createMessage.mutateAsync({
        prompt: prompts.prompt,
        projectId,
        selectedModel
     })
  }
  const showUsage = !!usage
  return (
   <Form {...form}>
   {
    showUsage && (
      <Usage points={usage.remainingPoints} msBeforeNext={usage.msBeforeNext} />
    )
   }
     <form
     className={cn(
         "relative bg-sidebar border border-black/15 rounded-xl p-3  pt-1 dark:bg-white/15 dark:border-white/15 transition-all",
         isFocused && 'shadow-xs',
         showUsage && "rounded-t-none"

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
    </Form>
  )
}

export default MessageForm