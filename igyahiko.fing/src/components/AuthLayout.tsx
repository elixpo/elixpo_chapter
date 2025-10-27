import React, { ReactNode } from 'react';
import { useRouter } from 'next/navigation'
import { Auth, logos } from '../../public/assets/images/images';
import Image from 'next/image';
import {  ArrowLeft } from 'lucide-react';

interface AuthLayoutProps {
  children: ReactNode;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  const navigate = useRouter();

  return (
    <div className='flex flex-col  md:flex-row w-full h-screen overflow-hidden'>
        {/* right */}
      <div  className='w-full relative md:w-1/2 h-auto px-5 md:px-10  overflow-y-auto no-scrollbar'>
       <div className='fixed py-3 top-0 '>
        <div className='flex items-center justify-between'>
             <div className='flex items-center gap-1' > 
            <Image alt='' className='w-10 h-10' src={logos.logo7} />
            <span className='font-bold text-xl' style={{fontFamily: 'poppins'}} >FingAI.</span>
         </div>
         <div onClick={() => navigate.push('/')} className='absolute -right-56 md:-right-135 p-2 bg-white top-4 rounded-full'>
            <ArrowLeft  className='text-black' size={19} />
         </div>
        </div>
       </div>
        <div
       
       
      >
        
       
        {children}
      </div>
       </div>
      {/* Left Auth Content */}
     <div
        className='hidden md:flex w-1/2 h-full relative items-center justify-center overflow-hidden'
       
      >
        {/* Decorative Top Overlay */}
        <div
          
          className='w-[200px] h-[150px] rounded-br-3xl absolute top-0 left-0 z-10'
        />

      
        {/* Main Illustration */}
      <div className="relative w-full h-full max-w-full max-h-full z-20">
  {/* Background image */}
  <Image
    src={Auth.login8}
    fill
    className="object-cover"
    alt="login-illustration"
    priority
  />

  {/* Blur overlay */}
  <div className="absolute inset-0  bg-black/15 backdrop-blur-xs z-10" />
</div>


      </div>
      
      {/* Right Side Image Section */}
      
    </div>
  );
};

export default AuthLayout;
