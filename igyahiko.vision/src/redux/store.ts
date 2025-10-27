import {combineReducers, configureStore, Middleware, ReducersMapObject} from "@reduxjs/toolkit"
import { slices } from "./slices"
import { apis } from "./api/index"
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux"

export type RootState = ReturnType<typeof rootReducer>
export const rootReducer = combineReducers({
     ...slices,
     ...apis.reduce((acc, api) => {
         acc[api.reducerPath] = api.reducer
         return acc
     },{} as ReducersMapObject
    ),
    
})

export const makeStore = (preloadedState?: Partial<RootState>) => {
   return configureStore({
       reducer: rootReducer,
       middleware: (gDM) => 
        gDM().concat(...apis.map((a) => a.middleware as Middleware)),
        preloadedState,
       devTools: process.env.NODE_ENV !== 'production'
   })
}


export type Appstore = ReturnType<typeof makeStore>
export type AppDispatch = Appstore['dispatch']
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector
export const useAppDispatch = () => useDispatch<AppDispatch>()