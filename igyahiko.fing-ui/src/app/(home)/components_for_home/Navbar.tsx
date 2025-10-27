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
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import ThemeToggleButton from "@/components/ui/theme-toggle-button";
import { useTheme } from "next-themes";
import { BsDiscord } from "react-icons/bs";
import { ExpandedTabs } from "@/components/ui/expanded-tabs";

const Navbar: React.FC = () => {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // lock body scroll when drawer open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!mounted) return null;

  const options = [
    { title: "Docs", href: "/docs", icon: FileCode },
    { title: "Components", href: "/docs/components/ai", icon: Code },
    { title: "Themes", href: "/themes", icon: Moon },
    { title: "Color", href: "/color", icon: HandPlatter },
    { title: "Blocks", href: "/block", icon: Blocks },
  ];

  return (
    <header className="py-3 sticky top-0 z-50 bg-background">
      <div className="container px-4 md:px-10 lg:px-2 mx-auto">
        <div className="flex items-center justify-between rounded-full px-4 md:px-0">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <Image
              src={theme === "dark" ? LOGO.DARK_LOGO : LOGO.LIGHT_LOGO}
              alt="logo"
              className="w-10 h-10 object-contain"
            />
            <span className="font-mono">FingUI.</span>
          </div>

          {/* Desktop Nav */}
          <div className="gap-5 hidden md:block">
            <ExpandedTabs className="mt-2 font-mono" tabs={options} />
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-2">
            <Button className="py-2 px-3 hidden md:block" variant={"ghost"}>
              <Link href={"https://github.com/IgYaHiko"} aria-label="GitHub">
                <GitBranch className="w-4 h-4" />
              </Link>
            </Button>

            <ThemeToggleButton variant="circle-blur" />

            <Button className="py-2 px-3 hidden md:block" variant={"ghost"}>
              <Link
                href={"https://discord.gg/rNChHMcGdG"}
                aria-label="Discord"
              >
                <BsDiscord className="w-4 h-4" />
              </Link>
            </Button>

            <Button className="py-2 px-3 hidden md:block" variant={"ghost"}>
              <Link href={"https://fing-nu.vercel.app/"} aria-label="FingAI">
                <Image
                  src={theme === "dark" ? LOGO.FINGAI_DARK : LOGO.FINGAI_LIGHT}
                  alt="FingAI"
                  className="w-5 h-5"
                />
              </Link>
            </Button>

            {/* Mobile menu button */}
            <button
              aria-label="Open menu"
              onClick={() => setOpen(true)}
              className="p-2 md:hidden rounded-full hover:bg-muted/30"
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      <div
        aria-hidden={!open}
        className={`fixed inset-0 z-50 transition-opacity duration-200 ${
          open ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        {/* backdrop */}
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${
            open ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* panel */}
        <aside
          className={`fixed left-0 top-0 bottom-0 z-50 w-[280px] max-w-full transform bg-background shadow-lg transition-transform duration-300 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <Image
                src={theme === "dark" ? LOGO.DARK_LOGO : LOGO.LIGHT_LOGO}
                alt="logo"
                className="w-8 h-8 object-contain"
              />
              <span className="font-mono text-lg">FingUI.</span>
            </div>
            <button
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="p-2 rounded-md hover:bg-muted/30"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="px-2 py-4">
            {options.map((opt) => {
              const Icon = opt.icon;
              return (
                <Link
                  key={opt.href}
                  href={opt.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/20"
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{opt.title}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto px-4 py-4 border-t">
            <div className="flex items-center gap-2 mb-3">
              <ThemeToggleButton variant="circle-blur" />
              <Button className="py-2 px-3" variant="ghost">
                <Link href={"https://github.com/IgYaHiko"}>GitHub</Link>
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} FingUI
            </div>
          </div>
        </aside>
      </div>
    </header>
  );
};

export default Navbar;
