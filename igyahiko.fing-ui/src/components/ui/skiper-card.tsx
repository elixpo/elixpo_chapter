"use client"

import { useEffect, useState, type MouseEvent } from "react"
import Image, { type StaticImageData } from "next/image"
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  type MotionStyle,
  type MotionValue,
} from "motion/react"
import Balancer from "react-wrap-balancer"

import { cn } from "@/lib/utils"

type WrapperStyle = MotionStyle & {
  "--x": MotionValue<string>
  "--y": MotionValue<string>
}

interface CardProps {
  title: string
  description: string
  bgClass?: string
}

function FeatureCard({
  title,
  description,
  bgClass,
  children,
}: CardProps & {
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(false)
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const isMobile = useIsMobile()

  function handleMouseMove({ currentTarget, clientX, clientY }: MouseEvent) {
    if (isMobile) return
    const { left, top } = currentTarget.getBoundingClientRect()
    mouseX.set(clientX - left)
    mouseY.set(clientY - top)
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <motion.div
      className="animated-cards relative w-full rounded-[16px]    "
      onMouseMove={handleMouseMove}
      style={
        {
          "--x": useMotionTemplate`${mouseX}px`,
          "--y": useMotionTemplate`${mouseY}px`,
        } as WrapperStyle
      }
    >
      <div
        className={cn(
          "group relative w-full overflow-hidden rounded-3xl border border-black/10  bg-gradient-to-b from-neutral-900/90 to-stone-800 transition duration-300 dark:from-neutral-950/90 dark:to-neutral-800/90",
          "md:hover:border-transparent",
          bgClass
        )}
      >
        <div className="m-10 min-h-[550px]  w-full">
          <div className="flex w-4/6 flex-col gap-3">
            <h2 style={{fontFamily: "poppins"}} className="text-xl mt-2 font-black tracking-tight text-white md:text-xl">
              {title}
            </h2>
            <p className="text-sm font-mono leading-5  text-neutral-300 dark:text-zinc-400 sm:text-xs sm:leading-5">
              <Balancer>{description}</Balancer>
            </p>
          </div>
          {mounted ? children : null}
        </div>
      </div>
    </motion.div>
  )
}

const steps = [
  { id: "1", name: "" },
  { id: "2", name: "" },
  { id: "3", name: "" },
]

export function SkiperCard({
  image,
  step1img1Class,
  step1img2Class,
  step2img1Class,
  step2img2Class,
  step3imgClass,
  ...props
}: CardProps & {
  step1img1Class?: string
  step1img2Class?: string
  step2img1Class?: string
  step2img2Class?: string
  step3imgClass?: string
  image: {
    step1dark1: StaticImageData
    step1dark2: StaticImageData
    step1light1: StaticImageData
    step1light2: StaticImageData
    step2dark1: StaticImageData
    step2dark2: StaticImageData
    step2light1: StaticImageData
    step2light2: StaticImageData
    step3dark: StaticImageData
    step3light: StaticImageData
    step4light: StaticImageData
    alt: string
  }
}) {
  const { currentNumber: step, increment } = useNumberCycler()

  return (
    <FeatureCard {...props}>
      <div
        className={cn(
          { "translate-x-0 opacity-0": step < 3 },
          "absolute left-2/4 top-1/3 flex w-full -translate-x-1/2 -translate-y-[33%] flex-col gap-12 text-center text-2xl font-bold transition-all duration-500 md:w-3/5 "
        )}
      >
        <Image
          alt={image.alt}
          className="pointer-events-none top-1/2 w-[90%] overflow-hidden rounded-2xl border border-neutral-100/10 transition-all duration-500 dark:border-zinc-700 md:left-[35px] md:top-[30%] md:w-full"
          src={image.step4light}
          width={800}
          height={300}
          style={{
            position: "absolute",
            userSelect: "none",
            maxWidth: "unset",
          }}
        />
      </div>

      <>
        {/* step 1 */}
        <Image
          alt={image.alt}
          className={cn(step1img1Class, {
            "-translate-x-36 opacity-0 rounded-2xl": step > 0,
          })}
          src={image.step1light1}
          style={{
            position: "absolute",
            userSelect: "none",
            maxWidth: "unset",
          }}
        />
        <Image
          alt={image.alt}
          className={cn(step1img2Class, {
            "-translate-x-24 opacity-0 rounded-2xl": step > 0,
          })}
          src={image.step1light2}
          style={{
            position: "absolute",
            userSelect: "none",
            maxWidth: "unset",
          }}
        />

        {/* step 2 */}
        <Image
          alt={image.alt}
          className={cn(
            step2img1Class,
            "rounded-2xl",
            { "translate-x-36 opacity-0": step < 1 },
            { "-translate-x-36 opacity-0": step > 1 }
          )}
          src={image.step2light1}
          style={{
            position: "absolute",
            userSelect: "none",
            maxWidth: "unset",
          }}
        />
        <Image
          alt={image.alt}
          className={cn(
            step2img2Class,
            "rounded-2xl ",
            { "translate-x-24 opacity-0": step < 1 },
            { "-translate-x-24 opacity-0": step > 1 }
          )}
          src={image.step2light2}
          style={{
            position: "absolute",
            userSelect: "none",
            maxWidth: "unset",
          }}
        />
        {/* step 3 */}
        <Image
          alt={image.alt}
          className={cn(
            step3imgClass,
            "rounded-2xl",
            { "translate-x-36 opacity-0": step < 2 },
            { "-translate-x-36 opacity-0": step > 2 },
            { "opacity-90": step === 2 }
          )}
          src={image.step3light}
          style={{
            position: "absolute",
            userSelect: "none",
            maxWidth: "unset",
          }}
        />
        <div className="absolute left-48 top-5 z-50 size-full cursor-pointer md:left-0">
          <Steps current={step} onChange={() => {}} steps={steps} />
        </div>
      </>

      <div
        className="absolute right-0 top-0 z-50 size-full cursor-pointer md:left-0"
        onClick={() => increment()}
      />
    </FeatureCard>
  )
}

function IconCheck({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      fill="currentColor"
      className={cn("size-4", className)}
      {...props}
    >
      <path d="m229.66 77.66-128 128a8 8 0 0 1-11.32 0l-56-56a8 8 0 0 1 11.32-11.32L96 188.69 218.34 66.34a8 8 0 0 1 11.32 11.32Z" />
    </svg>
  )
}

interface StepsProps {
  steps: { id: string; name: string }[]
  current: number
  onChange: (stepIdx: number) => void
}

export function Steps({ steps, current, onChange }: StepsProps) {
  return (
    <nav aria-label="Progress" className="flex justify-center px-4 ">
      <ol
        className="flex w-full flex-wrap items-start justify-start gap-2  sm:justify-center md:w-10/12 md:divide-y-0"
        role="list"
      >
        {steps.map((step, stepIdx) => {
          const isCompleted = current > stepIdx
          const isCurrent = current === stepIdx
          const isFuture = !isCompleted && !isCurrent
          return (
            <li
              className={cn(
                "relative z-50 rounded-full px-3 py-1  transition-all duration-300 ease-in-out md:flex",
                isCompleted ? "bg-neutral-500/20" : "bg-neutral-500/10"
              )}
              key={`${step.name}-${stepIdx}`}
            >
              <div
                className={cn(
                  "group flex w-full cursor-pointer items-center focus:outline-none  focus-visible:ring-2",
                  (isFuture || isCurrent) && "pointer-events-none"
                )}
                onClick={() => onChange(stepIdx)}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span
                    className={cn(
                      "flex shrink-0 items-center justify-center rounded-full duration-300",
                      isCompleted &&
                        "bg-brand-400 dark:bg-brand-400 size-4 text-white",
                      isCurrent &&
                        "bg-brand-300/80 size-4 p-2 text-neutral-400 dark:bg-neutral-500/50",
                      isFuture &&
                        "bg-brand-300/10 size-4 p-2 dark:bg-neutral-500/20"
                    )}
                  >
                    {isCompleted ? (
                      <IconCheck className="size-3 stroke-white stroke-[3] text-white dark:stroke-black" />
                    ) : (
                      <span
                        className={cn(
                          "text-xs",
                          !isCurrent && "text-[#C6EA7E]"
                        )}
                      >
                        {stepIdx + 1}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-medium duration-300",
                      isCompleted && "text-brand-400 dark:text-brand-500",
                      isFuture && "text-neutral-500"
                    )}
                  >
                    {step.name}
                  </span>
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function useNumberCycler() {
  const [currentNumber, setCurrentNumber] = useState(0)
  const [dummy, setDummy] = useState(0)

  const increment = () => {
    setCurrentNumber((prevNumber) => {
      return (prevNumber + 1) % 4
    })

    setDummy((prev) => prev + 1)
  }

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentNumber((prevNumber) => {
        return (prevNumber + 1) % 4
      })
    }, 3000)

    return () => {
      clearInterval(intervalId)
    }
  }, [dummy])

  return {
    increment,
    currentNumber,
  }
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const userAgent = navigator.userAgent
    const isSmall = window.matchMedia("(max-width: 768px)").matches
    const isMobile = Boolean(
      /Android|BlackBerry|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.exec(
        userAgent
      )
    )

    const isDev = process.env.NODE_ENV !== "production"
    if (isDev) setIsMobile(isSmall || isMobile)

    setIsMobile(isSmall && isMobile)
  }, [])

  return isMobile
}
