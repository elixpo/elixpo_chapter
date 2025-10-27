"use client"

import { createRef, useRef, ReactNode } from "react"
import { cn } from "@/lib/utils"

interface ImageMouseTrailProps {
  items: string[] // array of image URLs
  children?: ReactNode
  className?: string
  imgClass?: string
  distance?: number
  maxNumberOfImages?: number
  fadeAnimation?: boolean
}

export default function ImageCursorTrail({
  items,
  children,
  className,
  maxNumberOfImages = 5,
  imgClass = "w-40 h-48",
  distance = 20,
  fadeAnimation = false,
}: ImageMouseTrailProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const refs = useRef(items.map(() => createRef<HTMLImageElement>()))
  const currentZIndexRef = useRef(1)

  let globalIndex = 0
  let last = { x: 0, y: 0 }

  const activate = (image: HTMLImageElement, x: number, y: number) => {
    const containerRect = containerRef.current?.getBoundingClientRect()
    if (!containerRect) return

    const relativeX = x - containerRect.left
    const relativeY = y - containerRect.top

    image.style.left = `${relativeX}px`
    image.style.top = `${relativeY}px`

    if (currentZIndexRef.current > 40) {
      currentZIndexRef.current = 1
    }

    image.style.zIndex = String(currentZIndexRef.current)
    currentZIndexRef.current++

    image.dataset.status = "active"
    if (fadeAnimation) {
      setTimeout(() => {
        image.dataset.status = "inactive"
      }, 1500)
    }

    last = { x, y }
  }

  const distanceFromLast = (x: number, y: number) => {
    return Math.hypot(x - last.x, y - last.y)
  }

  const deactivate = (image: HTMLImageElement) => {
    image.dataset.status = "inactive"
  }

  // accept either native MouseEvent, Touch, or React.MouseEvent
  const handleOnMove = (
    e: MouseEvent | Touch | React.MouseEvent<HTMLElement>
  ) => {
    const clientX = "clientX" in e ? e.clientX : 0
    const clientY = "clientY" in e ? e.clientY : 0

    if (distanceFromLast(clientX, clientY) > window.innerWidth / distance) {
      const lead = refs.current[globalIndex % refs.current.length].current
      const tail =
        refs.current[(globalIndex - maxNumberOfImages) % refs.current.length]
          ?.current

      if (lead) activate(lead, clientX, clientY)
      if (tail) deactivate(tail)
      globalIndex++
    }
  }

  return (
    <section
      onMouseMove={(e) => handleOnMove(e)}
       /* @ts-expect-error ShareButton component has no typed props for `links` */
      onTouchMove={(e) => handleOnMove(e.touches[0])}
      ref={containerRef}
      className={cn(
        "relative grid h-[600px] w-full place-content-center overflow-hidden rounded-lg",
        className
      )}
    >
      {items.map((item, index) => (
        <div key={index}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={cn(
              "opacity:0 data-[status='active']:ease-out-expo absolute -translate-x-[50%] -translate-y-[50%] scale-0 rounded-3xl object-cover transition-transform duration-300 data-[status='active']:scale-100 data-[status='active']:opacity-100 data-[status='active']:duration-500",
              imgClass
            )}
            data-index={index}
            data-status="inactive"
            src={item}
            alt={`image-${index}`}
            ref={refs.current[index]}
          />
        </div>
      ))}
      {children}
    </section>
  )
}
