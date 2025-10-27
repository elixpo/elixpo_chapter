"use client";
import React from "react";
import { UserButton } from "@clerk/nextjs";
import {dark} from '@clerk/themes'
import { useCurrentTheme } from "@/hooks/use-current-theme";

interface Props {
  showName?: boolean;
}

const UserControl = ({ showName }: Props) => {

  const currTheme = useCurrentTheme();

  return (
    <UserButton
      showName={showName}
      afterSignOutUrl="/"
      appearance={{
       
        elements: {
          // Button container
         /*  userButtonTrigger:
            "flex items-center gap-3 px-4! py-2 rounded-full bg-black! text-white hover:bg-neutral-800 transition duration-300",
 */
          // Avatar box - increased size, no ring
          avatarBox: "w-8! h-8! rounded-full",

          // User name
          userButtonName: "text-base! font-mono! text-white!",

          // Dropdown
          userButtonPopoverCard:
            "rounded-lg! mt-2!",

          userButtonPopoverHeader:
            "px-4! pt-4! pb-2! text-xs! text-gray-500 uppercase tracking-wide",

          userButtonPopoverActionButton:
            "w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition rounded-md text-sm",

          userButtonPopoverActionButtonText: "text-sm! font-normal!",
          userButtonPopoverFooter: 'hidden!'
          

        },
         baseTheme: currTheme === 'dark' ? dark : undefined
      }}
    />
  );
};

export default UserControl;
