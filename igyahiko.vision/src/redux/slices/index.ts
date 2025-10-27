import { Reducer } from "@reduxjs/toolkit";
import profile from './profile'
import projects from './project'
import viewport from './viewport'
import shapes from './shapes'
export const slices: Record<string, Reducer> = {
   profile,
   projects,
   viewport,
   shapes

   

}