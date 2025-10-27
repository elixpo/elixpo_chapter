import React, { useEffect } from 'react'
import Prism from 'prismjs'
import 'prismjs/components/prism-javascript'
import "prismjs/components/prism-jsx"
import "prismjs/components/prism-tsx"
import "prismjs/components/prism-typescript"
import "prismjs/components/prism-python"
import "./code-theme.css"


interface Props {
     code: string,
     language: string
}
const CodeView = (props:Props) => {
    useEffect(() => {
      Prism.highlightAll()
    },[props.code])
  return (
   <pre className='p-2 bg-transparent relative border-none rounded-none m-0 text-xs'>
 
    <code className={`language-${props.language}`}>
        
        {props?.code}
    </code>
   </pre>
  )
}

export default CodeView