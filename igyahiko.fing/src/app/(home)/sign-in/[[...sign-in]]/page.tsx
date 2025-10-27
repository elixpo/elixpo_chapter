"use client";

import AuthLayout from "@/components/AuthLayout";
import { SignIn } from "@clerk/nextjs";
import {dark} from '@clerk/themes'
import React from "react";
import { useCurrentTheme } from "@/hooks/use-current-theme";
import Link from "next/link";

const SignInPage = () => {
  const useCurrTheme = useCurrentTheme()
  return (
    <AuthLayout>
        <section className="flex flex-col justify-center items-center h-screen bg-dot-black/[0.4]">
      <SignIn 
      
        appearance={{
            
            elements:{
                  
                  card: 'bg-neutral-950! shadow-none!  border-none!',
                   headerTitle: 'text-white  text-3xl! font-[poppins]! font-bold!',
                   headerSubtitle: "font-mono!  text-xs!",
                   formFieldInput: 'bg-white/10! py-6!',
                   formButtonPrimary: 'bg-pink-500! text-white! py-2.5! hover:bg-white/90',
                    socialButtonsBlockButton: "py-3!",
                    dividerText: 'text-white/60!',
                    footer: 'bg-transparent! hidden!  border-none! mt-5!',
                    footerAction: 'text-white text-xs font-mono',
                    footerActionLink: 'text-pink-500 hover:underline font-mono',
                    footerPoweredBy: 'text-pink-400 text-xs font-mono',
                    footerDeveloper: 'text-pink-500 text-xs font-mono! mt-1',
                   
            },
             baseTheme: useCurrTheme === 'dark' ? dark : undefined
        }}
    
      />
      <div className="mt-4">
        <div className="text-center mb-6">
          <p className="text-xs font-mono">Don&apos;t have an Account ? <Link className="" href={"/sign-up"} >
          <span className="font-mono hover:underline text-pink-400 text-xs">Sign Up</span></Link> </p>
        </div>
        </div>
    </section>
    </AuthLayout>
  );
};

export default SignInPage;
