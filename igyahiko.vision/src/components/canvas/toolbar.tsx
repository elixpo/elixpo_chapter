import React from 'react'
import HistoryPill from './history/historyPill'
import Zoombar from './zoombar/zoombar'
import ToolbarShapes from './toolbar-shapes'

const Toolbar = () => {
  return (
    <div className='fixed bottom-0 w-full flex items-center justify-between z-50 p-5'>
       
         <HistoryPill/>
        <ToolbarShapes/>
        <Zoombar/>
      
    </div>
  )
}

export default Toolbar