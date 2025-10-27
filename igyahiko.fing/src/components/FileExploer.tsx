

import React, { Fragment, useCallback, useMemo, useState } from 'react'
import { ResizablePanel, ResizablePanelGroup,ResizableHandle } from './ui/resizable';
import CodeView from './code-view/CodeView';
import Hint from '@/modules/projects/ui/views/components/Hint';
import { Button } from './ui/button';
import { Copy, CopyCheck } from 'lucide-react';
import { covertFilesToTress } from '@/lib/utils';
import TreeView from './TreeView';
import { Breadcrumb, BreadcrumbEllipsis, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from './ui/breadcrumb';
type FileCollection = {[path:string]:string};

const getExtension = (filename:string) => {
     const ex = filename.split(".").pop()?.toLowerCase();
     return ex || 'txt'
}
interface Props {
     files: FileCollection
}
const FileExploer = (prosp: Props) => {
 const [copy,setCopy] = useState(false);
  const [selectFiles,setSelectFiles] = useState<string | null>(() => {
     const fileKeys = Object.keys(prosp.files);
     return fileKeys.length > 0 ? fileKeys[0] : null
  })

  const treeData = useMemo(() => {
     return covertFilesToTress(prosp.files)
  },[prosp.files]);

  const handleSelect = useCallback((filePath:string) => {
     if(prosp.files[filePath]) {
         setSelectFiles(filePath)
     }
  },[prosp.files])
   
 const handlCopy = useCallback(() => {
      if(selectFiles) {
         navigator.clipboard.writeText(prosp.files[selectFiles]);
         setCopy(true);
         setTimeout(() => {
            setCopy(false)
         },2000)
      }
 },[selectFiles,prosp.files])
  return (
   <ResizablePanelGroup direction='horizontal'>
    <ResizablePanel className='bg-sidebar' minSize={20} defaultSize={25} maxSize={40} >
      <TreeView
       data={treeData}
       value={selectFiles}
       onSelect={handleSelect}
      />
    </ResizablePanel>
     <ResizableHandle withHandle className='hover:bg-primary transition-colors'/>
    <ResizablePanel defaultSize={70} minSize={50}>
      {
        selectFiles && prosp.files[selectFiles] ? (
            <div className='h-full w-full overflow-auto flex flex-col'>
        <div className='border-b bg-sidebar px-4 py-1 flex justify-between items-center gap-x-2'>
            <FileBreadCrump filePath={selectFiles}/>
            <Hint message='Copy to clipboard'>
             <Button onClick={handlCopy} size='icon' variant='ghost' className='ml-auto'>
                {
                    copy ? (<CopyCheck className='size-4' />) : (
                        <Copy className='size-4' />
                    )
                }
             </Button>
            </Hint>
        </div>
        <div className='flex-1 px-2 overflow-auto'>
           <CodeView language={getExtension(selectFiles)} code={prosp.files[selectFiles]} />
        </div>
      </div>
        ) : (
            <div>click on file to view its content</div>
        )
      }
    </ResizablePanel>
   </ResizablePanelGroup>
  )
}

export default FileExploer


interface FileBreadCrumpProps {
  filePath: string;
}

function FileBreadCrump({ filePath }: FileBreadCrumpProps) {
  const pathSeg = filePath.split("/");
  const maxseg = 4;

  const renderBreadCrump = () => {
    if (pathSeg.length <= maxseg) {
      return pathSeg.map((item, i) => {
        const isLast = i === pathSeg.length - 1;

        return (
          <Fragment key={i}>
            <BreadcrumbItem>
              {isLast ? (
                <BreadcrumbPage className='font-medium font-mono'>
                  {item}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbPage className='text-muted-foreground font-mono'>
                  {item}
                </BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {!isLast && <BreadcrumbSeparator />}
          </Fragment>
        );
      });
    } else {
      const firstSeg = pathSeg[0];
      const lastSeg = pathSeg[pathSeg.length - 1];
      return (
        <>
          <BreadcrumbItem>
            <span className='text-muted-foreground font-mono'>
              {firstSeg}
            </span>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbEllipsis />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
           <BreadcrumbPage className='font-medium'>
            <span>{lastSeg}</span>
           </BreadcrumbPage>
          </BreadcrumbItem>
        </>
      );
    }
  };

  return (
    <Breadcrumb>
    <BreadcrumbList>
    {renderBreadCrump()}
    </BreadcrumbList>
    </Breadcrumb>
  )
}