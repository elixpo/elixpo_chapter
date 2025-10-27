
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import Image from 'next/image';
import { LOGO } from '../../public/assets/images/images';
import { HeaderPro } from '@/components/landing/header-pro';

export function baseOptions(): BaseLayoutProps {
  
  return {
    nav: {
      
      title: (
        <div className='flex items-center gap-2'>
          <Image
           className='w-8 h-8 object-contain'
           alt=''
           src={LOGO.DARK_LOGO}
          />
        <span className='font-mono'>FingUI.</span>
        </div>
      )
    },
    links: [
       {
        text: "Pricing",
        url: '/pricing'
       },
       {
         text: "Components",
         url: "/components"
       },
       {
         text: "Themes",
         url: "/themes"
       },
       {
         text: "Blocks",
         url: "/blocks",
         
       },
       {
        type: "custom",
        children: <HeaderPro/> ,
        
       }
    ],

  };
}