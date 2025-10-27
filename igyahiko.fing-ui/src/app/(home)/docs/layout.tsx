
import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/notebook';
import { baseOptions } from '@/lib/layout.shared';
import { ReactNode } from 'react';

export default function Layout({ children }: {children: ReactNode}) {
  return (
    <DocsLayout 
     tree={source.pageTree} {...baseOptions()} sidebar={{
      defaultOpenLevel: 1,
      className: 'dark:bg-black font-mono'     // Tailwind class
      
      }}  >
      <div className='px-0 md:px-36 font-[poppins] font-medium '>
        {children}
      </div>
    </DocsLayout>
  );
}

