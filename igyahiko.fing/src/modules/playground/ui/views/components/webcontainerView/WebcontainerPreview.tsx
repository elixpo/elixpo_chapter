"use client"
import { Progress } from '@/components/ui/progress'
import { transformToWebContainerFormat } from '@/features/webcontainer/hooks/transformers'
import { WebContainer } from '@webcontainer/api'
import { CheckCircle, Loader2, XCircle } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { TemplateFolder } from '../../types/types'

// Dynamically import TerminalComponent to avoid SSR issues
const TerminalComponent = dynamic(() => import('./TerminalComponent'), {
  ssr: false,
  loading: () => (
    <div className="h-full bg-black rounded-lg p-4 text-green-400 font-mono text-sm flex items-center justify-center">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading terminal...</span>
      </div>
    </div>
  )
});

interface WebContainerPreviewProps {
    templateData: TemplateFolder | null
    serverUrl: string
    isLoading: boolean
    error: string | null
    instance: WebContainer | null
    writeFileSync: (path: string, content: string) => Promise<void>
    forceResetup?: boolean
}

const WebcontainerPreview = ({
    error,
    instance,
    isLoading,
    serverUrl,
    templateData,
    writeFileSync,
    forceResetup=false
}: WebContainerPreviewProps) => {
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [loadingState, setLoadingState] = useState({
    transforming: false,
    mounting: false,
    installing: false,
    starting: false,
    ready: false,
  });
  const [currentStep, setCurrentStep] = useState(0);
  const totalSteps = 4;
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [isSetupInProgress, setIsSetupInProgress] = useState(false);
  const terminalRef = useRef<any>(null);
  
  useEffect(() => {
      if(forceResetup) {
         setIsSetupComplete(false)
         setIsSetupInProgress(false)
         setPreviewUrl("")
         setCurrentStep(0)
         setLoadingState({
            transforming: false,
            installing: false,
            mounting: false,
            ready: false,
            starting: false
         })
      }
  },[forceResetup])

  useEffect(() =>  {
    async function setWebContainer() {
        if(!instance || isSetupComplete || isSetupInProgress || !templateData) return;

        try {
           setIsSetupInProgress(true);
           setSetupError(null);

           try {
             const packageJsonExist = await instance.fs.readFile("package.json","utf-8");

             if(packageJsonExist) {
                if(terminalRef.current?.writeToTerminal) {
                      terminalRef.current.writeToTerminal("Reconnect to existing webcontainer session...\r\n")
                }
             }

             instance.on("server-ready", (port: number, url: string) => {
                   console.log(`Reconnect to server on port ${port} at ${url}`);
                   if(terminalRef.current?.writeToTerminal) {
                     terminalRef.current.writeToTerminal(`🌍 Reconnected to server at ${url}\r\n`)
                   }

                   setPreviewUrl(url);
                   setLoadingState((prev) => ({
                      ...prev,
                      starting: false,
                      ready: true
                   }));
                   setIsSetupComplete(true)
                   setIsSetupInProgress(false)
             })
             setCurrentStep(4);
             setLoadingState((prev) => ({...prev, starting: true}));
             return
           } catch (error) {
             // Continue with setup if package.json doesn't exist
           }
           
           //transform data
           setLoadingState((prev) => ({...prev, transforming: true}));
           setCurrentStep(1);

           //terminal stuff
           if(terminalRef.current?.writeToTerminal){
             terminalRef.current.writeToTerminal(`🚀 Transforming Template Data...\r\n`)
           }
          //@ts-ignore
           const files = transformToWebContainerFormat(templateData);

           setLoadingState((prev) => ({
             ...prev, 
             transforming: false,
             mounting: true
           }));
           setCurrentStep(2);

           //terminal related Stuff;
           if(terminalRef.current?.writeToTerminal){
             terminalRef.current.writeToTerminal(`📁 Mounting files to WebContainer...\r\n`)
           }

           await instance.mount(files);

           setLoadingState((prev) => ({
             ...prev,
             mounting: false,
             installing: true
           }));

           setCurrentStep(3);

           //terminal related Stuff
           if(terminalRef.current?.writeToTerminal){
             terminalRef.current.writeToTerminal(`💻 Installing dependencies\r\n`)
           }

           const installationProcess = await instance.spawn("npm", ["install"]);
           installationProcess.output.pipeTo(
             new WritableStream({
                 write( data ) {
                     //write directly in the terminal
                      if(terminalRef.current?.writeToTerminal) {
                          terminalRef.current.writeToTerminal(data)
                    }
                 }
             })
           );

           const installExitCode = await installationProcess.exit;

           if(installExitCode !== 0) {
             console.log(`Failed to install dependencies, Exit code: ${installExitCode}`)
             throw new Error(`Installation failed with exit code ${installExitCode}`);
           };
           
           if(terminalRef.current?.writeToTerminal){
             terminalRef.current.writeToTerminal(`✅ Installed dependencies successfully\r\n`)
           }
           
           setLoadingState((prev) => ({
             ...prev,
             installing: false,
             starting: true
           }));

           setCurrentStep(4);
          
           const startProcess = await instance.spawn("npm", ["run", "start"]);

           //listen for server ready event
           instance.on("server-ready",(port: number, url: string) => {
              console.log(`Server is running on ${port} at ${url}`)
             if(terminalRef.current?.writeToTerminal){
               terminalRef.current.writeToTerminal(`📈 Your server ready at ${url} \r\n`)
             }

              setPreviewUrl(url);

              setLoadingState((prev) => ({
                 ...prev,
                 starting: false,
                 ready: true
              }));

              setIsSetupComplete(true);
              setIsSetupInProgress(false)
           });

           //handle startProcess output
           startProcess.output.pipeTo(
              new WritableStream({
                 write ( data ) {
                   if(terminalRef.current?.writeToTerminal) {
                     terminalRef.current.writeToTerminal(data)
                   }
                 }
              })
           )

        } catch (error) {
           console.log(`Error setting up WebContainer`,error);
           const errorMsg = error instanceof Error ? error.message : String(error);

           if(terminalRef.current?.writeToTerminal) {
             terminalRef.current.writeToTerminal(`❌ Error: ${errorMsg}\r\n`)
           }

           setSetupError(errorMsg);
           setIsSetupInProgress(false);
           setLoadingState({
             transforming: false,
             installing: false,
             mounting: false,
            ready: false,
            starting: false
           })
        }
    }

    setWebContainer()
  },[
    instance,
    templateData,
    isSetupComplete,
    isSetupInProgress
  ])

  // Handle case when templateData is null
  if (!templateData) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md p-6 rounded-lg bg-gray-50 dark:bg-gray-900">
          <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full w-12 h-12 flex items-center justify-center mx-auto">
            <span className="text-2xl">📁</span>
          </div>
          <h3 className="text-lg font-medium">No Template Selected</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Please select a template to begin working with the WebContainer.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md p-6 rounded-lg bg-gray-50 dark:bg-gray-900">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <h3 className="text-lg font-medium">Initializing WebContainer</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Setting up the environment for your project...
          </p>
        </div>
      </div>
    );
  }

  if (error || setupError) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-6 rounded-lg max-w-md">
          <div className="flex items-center gap-2 mb-3">
            <XCircle className="h-5 w-5" />
            <h3 className="font-semibold">Error</h3>
          </div>
          <p className="text-sm">{error || setupError}</p>
        </div>
      </div>
    );
  }

   const getStepIcon = (stepIndex: number) => {
    if (stepIndex < currentStep) {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    } else if (stepIndex === currentStep) {
      return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    } else {
      return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />;
    }
  };

  const getStepText = (stepIndex: number, label: string) => {
    const isActive = stepIndex === currentStep;
    const isComplete = stepIndex < currentStep;
    
    return (
      <span className={`text-sm font-mono font-bold ${
        isComplete ? 'text-green-300' : 
        isActive ? 'text-blue-300' : 
        'text-gray-500'
      }`}>
        {label}
      </span>
    );
  };
  
  return (
     <div className='flex flex-col h-full w-full'>
      {!previewUrl ? (
        <div className="h-full flex flex-col">
          <div className="w-full max-w-md p-6 m-5 rounded-lg bg-white dark:bg-zinc-800 shadow-sm mx-auto">
            <Progress
              value={(currentStep / totalSteps) * 100}
              className="h-2 mb-6"
            />

            <div className="space-y-4 mb-6">
              <div className="flex items-center gap-3">
                {getStepIcon(1)}
                {getStepText(1, "Transforming template data")}
              </div>
              <div className="flex items-center gap-3">
                {getStepIcon(2)}
                {getStepText(2, "Mounting files")}
              </div>
              <div className="flex items-center gap-3">
                {getStepIcon(3)}
                {getStepText(3, "Installing dependencies")}
              </div>
              <div className="flex items-center gap-3">
                {getStepIcon(4)}
                {getStepText(4, "Starting development server")}
              </div>
            </div>
          </div>

          {/* Terminal */}
          <div className="flex-1 p-4">
            <TerminalComponent 
              ref={terminalRef}
              webContainerInstance={instance}
              theme="dark"
              className="h-full"
            />
          </div>
        </div>
      ) : (
        <div className='h-full flex flex-col'>
          <div className='flex-1'>
            <iframe 
              src={previewUrl} 
              className='h-full w-full border-none' 
              title='WebContainer Preview'
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            />
          </div>

          <div className='h-64 border-t'>
            <TerminalComponent 
              ref={terminalRef}
              webContainerInstance={instance}
              theme="dark"
              className="h-full"
            />
          </div>
        </div>
      )}
     </div>
  )
}

export default WebcontainerPreview