"use client"

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import { LucideIcon } from "lucide-react"
import { useOnClickOutside } from "usehooks-ts"

import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"

interface Tab {
  title: string
  icon: LucideIcon
  type?: never,
   href?: string
}

interface Separator {
  type: "separator"
  title?: never
  icon?: never
}

type TabItem = Tab | Separator

interface ExpandedTabsProps {
  tabs: TabItem[]
  className?: string
  activeColor?: string
  onChange?: (index: number | null) => void,
 
}

const buttonVariants = {
  initial: {
    gap: 0,
    paddingLeft: ".5rem",
    paddingRight: ".5rem",
  },
  animate: (isSelected: boolean) => ({
    gap: isSelected ? ".5rem" : 0,
    paddingLeft: isSelected ? "1rem" : ".5rem",
    paddingRight: isSelected ? "1rem" : ".5rem",
  }),
}

const spanVariants = {
  initial: { width: 0, opacity: 0 },
  animate: { width: "auto", opacity: 1 },
  exit: { width: 0, opacity: 0 },
}

const transition = { delay: 0.1, type: "spring", bounce: 0, duration: 0.6 }

export function ExpandedTabs({
  tabs,
  className,
  activeColor = "text-primary",
  onChange,
  
}: ExpandedTabsProps) {
  const router = useRouter()
  const [selected, setSelected] = React.useState<number | null>(null)
  const outsideClickRef = React.useRef<HTMLDivElement>(
    null as unknown as HTMLDivElement
  )

  useOnClickOutside(outsideClickRef, () => {
    setSelected(null)
    onChange?.(null)
  })

  const handleSelect = (index: number,href?: string) => {
    setSelected(index)
    onChange?.(index)
    if(href) {
       router.push(href)
    }
  }

  const Separator = () => (
    <div className=" h-[24px] w-[1.2px] bg-border" aria-hidden="true" />
  )

  return (
    <div
      
      ref={outsideClickRef}
      className={cn(
        " flex gap-2 rounded-2xl border bg-background p-1 shadow-sm ",
        className
      )}
    >
      {tabs.map((tab, index) => {
        if (tab.type === "separator") {
          return <Separator key={`separator-${index}`} />
        }

        const Icon = tab.icon
        return (
          <motion.button
            key={tab.title}
            variants={buttonVariants}
            initial={false}
            animate="animate"
            custom={selected === index}
            onClick={() => handleSelect(index)} 
           /* @ts-expect-error ShareButton component has no typed props for `links` */
            transition={transition}
            className={cn(
              "relative flex items-center rounded-xl px-4 py-2 text-sm font-medium transition-colors duration-300",
              selected === index
                ? cn("bg-muted", activeColor)
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon size={20} />
            <AnimatePresence initial={false}>
              {selected === index && (
                <motion.span
                  onClick={() => handleSelect(index, tab.href)}
                  variants={spanVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                 /* @ts-expect-error ShareButton component has no typed props for `links` */
                  transition={transition}
                  className="overflow-hidden"
                >
                  {tab.title}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        )
      })}
    </div>
  )
}
