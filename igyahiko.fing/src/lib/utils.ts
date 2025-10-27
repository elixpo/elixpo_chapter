import { TreeItem } from "@/types"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const covertFilesToTress = (files: {[path:string]:string},): TreeItem[] => {
   interface TreeNode {
     [key:string]: TreeNode | null
   }

   const treeNode: TreeNode = {}
   const sortedPath = Object.keys(files).sort();

   for(const filePaths of sortedPath) { 
      const parts = filePaths.split("/");
      let curr = treeNode

      for(let i=0; i<parts.length-1; i++) {
         const part = parts[i];
         if(!curr[part]) {
           curr[part] = {};
         }
         curr = curr[part];
      }
     const fileName = parts[parts.length - 1];
     curr[fileName] = null
   }
   const convertNodes = (node: TreeNode, name?: string): TreeItem[] | TreeItem=> {
     const entries = Object.entries(node);

     if(entries.length === 0) {
       return name || ""
     }

     const children: TreeItem[] = [];
     for(const [key,values] of entries) {
       if(values === null) {
         //this is a file 
         children.push(key)
       }else {
         //this is a folder
         const subtree = convertNodes(values,key)
         if(Array.isArray(subtree)) {
           children.push([key,...subtree])
         }else {
           children.push([key,subtree])
         }
       }
     }
     return children
   }
   const res = convertNodes(treeNode)
   return Array.isArray(res) ? res : [res];
}