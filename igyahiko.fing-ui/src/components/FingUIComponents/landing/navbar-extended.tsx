"use client";

import Image from "next/image";
import React, { useEffect, useState } from "react";
import { LOGO } from "../../../../public/assets/images/images";
import {
  Blocks,
  Code,
  FileCode,
  GitBranch,
  HandPlatter,
  Moon,
  
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import ThemeToggleButton from "@/components/ui/theme-toggle-button";
import { useTheme } from "next-themes";
import { BsDiscord } from "react-icons/bs";
import { AnimatePresence, motion } from "framer-motion";
import { useOnClickOutside } from "usehooks-ts";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { NavbarV1Props, NavOption } from "./tpyes";



export default function NavbarExtended  ({
  logoLight = LOGO.LIGHT_LOGO,
  logoDark = LOGO.DARK_LOGO,
  brandName = "FingUI",
  navOptions = [
    { title: "Docs", href: "/docs", icon: FileCode },
    { title: "Components", href: "/docs/components/ai", icon: Code },
    { title: "Themes", href: "/themes", icon: Moon },
    { title: "Color", href: "/color", icon: HandPlatter },
    { title: "Blocks", href: "/block", icon: Blocks },
  ],
  rightActions,
  activeColor = "text-primary",
}: NavbarV1Props)  {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <section className="py-3 sticky top-0 z-50">
      <div className="container px-4 md:px-10 lg:px-2 mx-auto">
        <div className="flex items-center justify-between rounded-full px-4 md:px-0">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <Image
              src={theme === "dark" ? logoDark : logoLight}
              alt="logo"
              className="w-10 h-10 object-contain"
            />
            <span className="font-mono">{brandName}</span>
          </div>

          {/* Desktop Nav */}
          <div className="gap-5 hidden md:block">
            <ExpandedTabs
              className="mt-2 font-mono"
              tabs={navOptions}
              activeColor={activeColor}
            />
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-2">
            {rightActions ? (
              rightActions
            ) : (
              <>
                <Button className="py-2 px-3" variant={"ghost"}>
                  <Link href={"https://github.com/IgYaHiko"}>
                    <GitBranch className="size-4" />
                  </Link>
                </Button>
                <ThemeToggleButton variant="circle-blur" />
                <Button className="py-2 px-3" variant={"ghost"}>
                  <Link href={"https://discord.gg/rNChHMcGdG"}>
                    <BsDiscord className="size-4" />
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};






interface ExpandedTabsProps {
  tabs: NavOption[];
  className?: string;
  activeColor?: string;
  onChange?: (index: number | null) => void;
}

const buttonVariants = {
  initial: { gap: 0, paddingLeft: ".5rem", paddingRight: ".5rem" },
  animate: (isSelected: boolean) => ({
    gap: isSelected ? ".5rem" : 0,
    paddingLeft: isSelected ? "1rem" : ".5rem",
    paddingRight: isSelected ? "1rem" : ".5rem",
  }),
};

const spanVariants = {
  initial: { width: 0, opacity: 0 },
  animate: { width: "auto", opacity: 1 },
  exit: { width: 0, opacity: 0 },
};

const transition = { delay: 0.1, type: "spring", bounce: 0, duration: 0.6 };

export function ExpandedTabs({
  tabs,
  className,
  activeColor = "text-primary",
  onChange,
}: ExpandedTabsProps) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<number | null>(null);
  const outsideClickRef = React.useRef<HTMLDivElement>(
    null as unknown as HTMLDivElement
  );

  useOnClickOutside(outsideClickRef, () => {
    setSelected(null);
    onChange?.(null);
  });

  const handleSelect = (index: number, href?: string) => {
    setSelected(index);
    onChange?.(index);
    if (href) router.push(href);
  };

  return (
    <div
      ref={outsideClickRef}
      className={cn(
        "flex gap-2 rounded-2xl border bg-background p-1 shadow-sm",
        className
      )}
    >
      {tabs.map((tab, index) => {
        const Icon = tab.icon;
        return (
          <motion.button
            key={tab.title}
            variants={buttonVariants}
            initial={false}
            animate="animate"
            custom={selected === index}
            onClick={() => handleSelect(index, tab.href)}
            //@ts-ignore
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
                  variants={spanVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  //@ts-ignore
                  transition={transition}
                  className="overflow-hidden"
                >
                  {tab.title}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </div>
  );
}
