import { TreeItem } from '@/types'
import React from 'react'
import { SidebarProvider,Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarRail } from './ui/sidebar'
import {  ChevronRightIcon, FileIcon, FolderIcon } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'

interface Props {
     data: TreeItem[],
     value?: string | null,
     onSelect?: (value: string) => void
}
const TreeView = ({data,value,onSelect}: Props) => {
  return (
   <SidebarProvider>
    <Sidebar collapsible='none' className='w-full' >
      <SidebarContent>
        <SidebarGroup>
            <SidebarGroupContent>
                <SidebarMenu>
                   {
                    data.map((item,i) => (
                        <TreeComp
                         key={i}
                         item={item}
                         selectedValue={value}
                         onSelect={onSelect}
                         parentPath=''
                        />
                    ))
                   }
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail/>
    </Sidebar>
   </SidebarProvider>
  )
}

export default TreeView

interface TreeProsss {
    item: TreeItem,
    selectedValue?: string | null,
    onSelect?: (value:string) => void,
    parentPath: string
}
const TreeComp = ({item,selectedValue,onSelect,parentPath}: TreeProsss) => {
     const [name, ...items] = Array.isArray(item) ? item : [item];
     const currPath = parentPath ? `${parentPath}/${name}` : name;
     const isSelected = selectedValue === currPath;
     
     if(!items.length) {
        return (
            <SidebarMenuButton
             isActive={isSelected}
             onClick={() => onSelect?.(currPath)}
            >
              <FileIcon className="size-4"/>
              <span className='truncate'>
                {name}
              </span>
            </SidebarMenuButton>
        )
     }
     
     return (
        <SidebarMenuItem>
            <Collapsible className='group-[.collapsible]'>
               <CollapsibleTrigger asChild>
                <SidebarMenuButton>
                    <ChevronRightIcon className="size-4 transition-transform group-data-[state=open]/collapsible:rotate-90"/>
                    <FolderIcon className="size-4"/>
                    <span className='truncate'>{name}</span>
                </SidebarMenuButton>
               </CollapsibleTrigger>
               <CollapsibleContent>
                 <SidebarMenuSub>
                    {items.map((sub,i) => (
                         <TreeComp 
                          key={i} 
                          item={sub} 
                          selectedValue={selectedValue} 
                          onSelect={onSelect} 
                          parentPath={currPath} 
                         />
                    ))}
                 </SidebarMenuSub>
               </CollapsibleContent>
            </Collapsible>
        </SidebarMenuItem>
     )
}