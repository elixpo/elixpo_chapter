'use client'
import React, { useRef } from 'react'

import { makeStore, RootState } from './store';
import { Provider } from 'react-redux';
type Props = {
     children: React.ReactNode;
     preloadedState: Partial<RootState>
}

const ReduxProvider = ({children,preloadedState}: Props) => {
  const storeRef = useRef(makeStore(preloadedState))
  return (
    <Provider store={storeRef.current} >
        {children}
    </Provider>
  )
}

export default ReduxProvider