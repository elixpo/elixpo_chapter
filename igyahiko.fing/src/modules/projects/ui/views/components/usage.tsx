import { Button } from '@/components/ui/button'
import { useAuth } from '@clerk/nextjs'
import { formatDuration, intervalToDuration } from 'date-fns'
import { CrownIcon } from 'lucide-react'
import Link from 'next/link'
import React from 'react'

interface Props {
  points: number,
  msBeforeNext: number
}

const Usage =  (props: Props) => {
  const {has} =  useAuth();
  const isPro = has?.({plan: 'pro'})
  return (
    <div className="py-6 px-5 bg-white dark:bg-zinc-900 rounded-t-xl border border-gray-200 dark:border-zinc-700 shadow-sm">
      <div className="flex justify-between items-center">
        <div className="font-mono flex flex-col space-y-1">
          <span className="text-xs sm:text-sm text-zinc-800 dark:text-zinc-200 font-semibold">
            {props.points} {isPro ? "" : "free"} Credits Remaining
          </span>
          <span className="text-xs text-muted-foreground">
            Reset in{" "}
            {
              formatDuration(
                intervalToDuration({
                  start: new Date(),
                  end: new Date(Date.now() + props.msBeforeNext)
                }),
                {
                  format: ['months', 'days', 'hours']
                }
              )
            }
          </span>
        </div>

        {
            isPro ? (<></>) : (<Button
          asChild
          size="sm"
          className="relative overflow-hidden font-mono text-white px-5 py-2 border border-transparent
          bg-gradient-to-r from-purple-500 via-pink-500 to-red-500
          bg-[length:200%_200%] animate-gradient-shine rounded-md shadow-md hover:shadow-lg transition-all duration-300"
        >
          <Link href="/pricing" className="flex items-center gap-2">
            <CrownIcon className="h-4 w-4" />
            Upgrade
          </Link>
        </Button>)
        }
      </div>
    </div>
  )
}

export default Usage
