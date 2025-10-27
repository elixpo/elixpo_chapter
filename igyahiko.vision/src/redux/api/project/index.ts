import {createApi, fetchBaseQuery} from "@reduxjs/toolkit/query/react"

interface AutoSaveProjectResponse {
     success: boolean;
     message: string;
     eventId: string;
}
interface AutoSaveProjectRequest {
     projectId: string;
     userId: string;
     shapeData: {
         shapes: Record<string, unknown>;
         tool: string;
         seleted: Record<string, unknown>;
         framerCounter: number;
     }
     viewPortData: {
         scale: number;
         translate: {x: number; y: number}
     }

}
export const projectAPI = createApi({
     reducerPath: "projectApi",
     baseQuery: fetchBaseQuery({baseUrl: '/api/project'}),
     tagTypes: ['Project'],
     endpoints: (builder) => ({
        autoSaveProject: builder.mutation<AutoSaveProjectResponse, AutoSaveProjectRequest>({
             query: (data) => ({
                 url: "",
                 method: "PATCH",
                 body: data
             })
        })
     })
})