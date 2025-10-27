import React from "react"
import { SparklesIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"

const BadgeButton = () => {
  return (
    <Badge
      variant="outline"
      className="mb-3 cursor-pointer rounded-[14px] border border-black/10 bg-white font-mono text-black text-base md:left-6 px-18 py-3" 
    >
      <SparklesIcon  className=" mr-2  fill-[#EEBDE0] stroke-1 text-neutral-800" />{" "}
      Component Preview
    </Badge>
  )
}

export default BadgeButton
