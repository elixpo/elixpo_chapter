"use client";

import { Github, Twitter, Linkedin, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import React from "react";

export default function Footer(): JSX.Element {
  const scrollToTop = (): void => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const navLinks: string[] = ["Home", "Features", "Docs", "Pricing", "Contact"];

  return (
    <footer
      className="relative mt-16 w-full border-t border-gray-300/20
      bg-gradient-to-br from-white/70 via-gray-100/40 to-gray-200/20
      dark:from-gray-900/70 dark:via-gray-950/60 dark:to-black/60
      backdrop-blur-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.1)]
      transition-all duration-500 rounded-t-3xl"
    >
      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
        {/* Branding */}
        <div className="hover:scale-105 hover:rotate-1 transition-transform duration-200">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 tracking-wide">
            Fing<span className="text-indigo-500">AI</span>
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Empowering creativity through intelligent automation.
          </p>
        </div>

        {/* Navigation Links */}
        <nav className="flex flex-wrap justify-center gap-6 text-sm">
          {navLinks.map((link) => (
            <a
              key={link}
              href={`/${link.toLowerCase()}`}
              className="text-gray-700 dark:text-gray-300 hover:text-indigo-500
              hover:scale-105 transition-all duration-200 relative after:content-['']
              after:block after:w-0 after:h-[2px] after:bg-indigo-500 after:transition-all
              after:duration-300 hover:after:w-full"
            >
              {link}
            </a>
          ))}
        </nav>

        {/* Social Icons */}
        <div className="flex items-center gap-5">
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
          >
            <Github
              className="h-5 w-5 text-gray-700 dark:text-gray-300 hover:text-indigo-500 
            transition-transform duration-200 hover:scale-125"
            />
          </a>

          <a
            href="https://twitter.com"
            target="_blank"
            rel="noreferrer"
            aria-label="Twitter"
          >
            <Twitter
              className="h-5 w-5 text-gray-700 dark:text-gray-300 hover:text-indigo-500 
            transition-transform duration-200 hover:scale-125"
            />
          </a>

          <a
            href="https://linkedin.com"
            target="_blank"
            rel="noreferrer"
            aria-label="LinkedIn"
          >
            <Linkedin
              className="h-5 w-5 text-gray-700 dark:text-gray-300 hover:text-indigo-500 
            transition-transform duration-200 hover:scale-125"
            />
          </a>
        </div>
      </div>

      {/* Divider & Bottom Section */}
      <div
        className="flex flex-col md:flex-row items-center justify-between text-xs
        text-gray-500 dark:text-gray-400 px-6 pb-6 max-w-7xl mx-auto border-t
        border-gray-200/10 pt-4"
      >
        <p>© {new Date().getFullYear()} FingAI. All rights reserved.</p>

        {/* Back to Top */}
        <Button
          variant="ghost"
          size="sm"
          onClick={scrollToTop}
          className="flex items-center gap-1 text-gray-600 dark:text-gray-300
          hover:text-indigo-500 hover:scale-105 hover:translate-y-[-2px]
          transition-all duration-200"
        >
          <ArrowUp className="h-4 w-4" />
          Back to Top
        </Button>
      </div>
    </footer>
  );
}
