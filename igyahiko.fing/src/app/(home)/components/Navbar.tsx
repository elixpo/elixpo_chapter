'use client';

import React, { useState, useRef } from 'react';
/* import { useRouter } from 'next/router'; */
import Image from 'next/image';

import { Menu, X } from 'lucide-react'; // ✅ Lucide icons
import { logos } from '../../../../public/assets/images/images';
import { Button } from '@/components/ui/button';

import { useRouter } from 'next/navigation'
import { SignedIn, SignedOut, SignInButton, SignUpButton } from '@clerk/nextjs';
import UserControl from '@/components/user-control';

// Adjust your color system if needed
/* const colors = {
  primary: '#3c096c',
  white: '#ffffff',
}; */

interface NavbarProps {
  title?: string;
  styless?: string;
  darkMode?: boolean;
}

const Navbar: React.FC<NavbarProps> = () => {
 
  const [isOpen, setIsOpen] = useState(false);
   const router = useRouter(); 
  const menuRef = useRef<HTMLDivElement>(null);

  /* const navItems = [
    { label: 'Overview' },
    { label: 'Feature' },
    { label: 'About' },
    { label: 'Contact' },
  ]; */

 /*  const buttonStyle = (type: 'login' | 'signup'): React.CSSProperties => ({
    backgroundColor: activeButton === type ? colors.primary : 'transparent',
    color: activeButton === type ? 'white' : colors.white,
    borderRadius: '100px',
    border: activeButton === type ? 'none' : '1px solid white',
    fontFamily: 'monospace',
    fontWeight: 500,
    padding: '7px 20px',
    cursor: 'pointer',
    transition: '0.2s ease',
  });
 */
 /*  const handleLogin = () => {
    
     router.push('/sign-in'); 
  };

  const handleSignUp = () => {
   
     router.push('/sign-up'); 
  }; */

  /* useEffect(() => {
    if (isOpen && menuRef.current) {
      gsap.fromTo(
        menuRef.current,
        { y: -20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: 'power2.out' }
      );
    }
  }, [isOpen]);
 */
  return (
    <section className="py-5 sticky top-0 z-50">
      <div className="container px-4 md:px-20 lg:px-2 mx-auto">
        <div className="flex items-center justify-between  rounded-full   px-4 md:px-10">
          {/* Logo */}
          <div className="flex items-center">
            <div className="w-[70px] flex gap-x-2">
              <Image
                src={logos.logo7}

                alt="Logo"
                width={38}
                height={38}
                className="object-contain"
                
              />
              <span className='font-bold text-2xl flex items-center gap-3' style={{fontFamily: "poppins"}}>FingAI. </span>
            </div>
            
          </div>

          {/* Desktop Nav */}
          

          {/* Right Section */}
          <div className="flex items-center gap-0">
            {/* Mobile Menu Toggle */}
            <div onClick={() => setIsOpen(!isOpen)} className="md:hidden mr-0 cursor-pointer">
              {isOpen ? (
                <X color="white" size={20} />
              ) : (
                <Menu  className='' size={20} />
              )}
            </div> 

            {/* Desktop Auth Buttons */}
            <SignedOut >
              <div className='flex gap-2 items-center'>
                 <SignUpButton>
                  <Button className='font-mono' variant={"outline"}>
                    Sign Up
                  </Button>
                 </SignUpButton>

                  <SignInButton>
                  <Button className='relative overflow-hidden font-mono   text-white 
                       bg-gradient-to-r from-purple-500 via-pink-600 to-red-600 
                       bg-[length:200%_200%]'
            style={{
              animation: 'shine 2s linear infinite',
              backgroundSize: '200% 200%',
              backgroundPosition: '0% 50%',
            }}>
                    Sign In
                  </Button>
                 </SignInButton>
              </div>
            </SignedOut>
            <SignedIn>
              <div className=' flex gap-4 items-center'>
                <div className='hidden md:block' >
                   <UserControl  showName />
                </div>
                 <Button onClick={() => router.push("/dashboard")} className='hidden md:block font-mono text-xs bg-pink-700  rounded-none dark:text-white hover:bg-pink-900' variant={"default"} >
                  Dashboard
                 </Button>
              </div>
             
            </SignedIn>
             
          
          </div>
        </div>

        {/* Mobile Nav Menu */}
        {isOpen && (
          <div className="fixed inset-0 z-50 backdrop-blur-md bg-neutral-900/70 flex flex-col items-center justify-center gap-8">
            {/* Close Icon */}
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-6 right-10 text-white text-2xl hover:text-red-400 transition"
              aria-label="Close Menu"
            >
              <X size={24} />
            </button>

            <div ref={menuRef} className="flex flex-col items-center gap-6">

              <div className="flex flex-col  text-lg items-center gap-4 text-white">
                <Button className='relative overflow-hidden font-mono  rounded-none  text-white 
                       bg-gradient-to-r from-purple-500 via-pink-600 to-red-600 
                       bg-[length:200%_200%]'
            style={{
              animation: 'shine 2s linear infinite',
              backgroundSize: '200% 200%',
              backgroundPosition: '0% 50%',
            }}>
                    Sign In
                  </Button>
                 <Button variant={"outline"} className='rounded-none' >
                    Sign Up
                  </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default Navbar;
