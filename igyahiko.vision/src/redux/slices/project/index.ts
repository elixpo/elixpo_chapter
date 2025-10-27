 import { createSlice, PayloadAction } from "@reduxjs/toolkit";


interface ProjectProps {
     _id: string;
     name: string
     projectNumber: number;
     thumbnail: string;
     lastModified: number;
     createdAt: number;
     isPublic: boolean;
}
interface ProjectState {
     projects: ProjectProps[];
     totalNumber: number;
     isLoading: boolean;
     error: string | null;
     lastFetched: number | null;
     isCreating: boolean;
     createError: string | null
}

const initialState: ProjectState = {
     projects: [],
     totalNumber: 0,
     isLoading: false,
     error: '',
     lastFetched: 0,
     isCreating: false,
     createError: ""
}

const projectSlice = createSlice({
     name: 'project',
     initialState,
     reducers: {
          fetchProjectStart: (state) => {
             state.isLoading = true
             state.error = null
          },
          fetchProjectSuccess: (state, action: PayloadAction<{projects: ProjectProps[]; total: number}>) => {
             state.isLoading = false;
             state.projects = action.payload.projects;
             state.totalNumber = action.payload.total;
             state.error = null;
             state.lastFetched = Date.now()

          },
          fetchProjectFailure: (state, action: PayloadAction<string>) => {
            state.isLoading = false;
            state.error = action.payload;
          },
          createProjectStart: (state) => {
             state.isCreating = true;
             state.createError= null
          },
          createProjectSuccess: (state) => {
             state.isCreating = false;
             state.createError = null;
          },
          createProjectFailure: (state,action: PayloadAction<string>) => {
            state.isCreating = false;
            state.createError = action.payload;
          },
          addProject: (state, action: PayloadAction<ProjectProps>) => {
              state.projects.unshift(action.payload);
              state.totalNumber = state.totalNumber + 1;
          },
          updateProject: (state, action: PayloadAction<ProjectProps>) => {
              const index = state.projects.findIndex(
                (project) => project._id === action.payload._id
              )
              if(index !== -1) {
                 state.projects[index] = {...state.projects[index], ...action.payload} 
              }
          },
          removeProjet: (state, action: PayloadAction<string>) => {
             state.projects = state.projects.filter((p) => p._id !== action.payload)
             state.totalNumber = Math.max(0, state.totalNumber - 1);
          },
          clearAllProjects: (state) => {
            state.projects = [];
            state.totalNumber = 0;
            state.error = null;
            state.createError = null;
            state.lastFetched = null;
          },
        createError: (state) => {
           state.error = null;
           state.createError = null;
        }

     }
})

export const {
    updateProject,
    addProject,
    clearAllProjects, 
    createError,
    createProjectFailure,
    createProjectStart,
    createProjectSuccess,
    fetchProjectFailure,
    fetchProjectStart,
    fetchProjectSuccess,
    removeProjet
} = projectSlice.actions
export default projectSlice.reducer 