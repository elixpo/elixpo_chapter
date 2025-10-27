"use client"
import PlaygroundLayout from '@/app/playground/[playgroundId]/PlaygroundLayout'
import { SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { usePlayground } from '@/features/playground/hooks/usePlayground'

import React, { useCallback, useEffect } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import TemplateTree from './components/templates-tree'
import CustomLoader from '@/components/loader/CustomLoader'
import { useFileExplorer } from '@/features/playground/hooks/useFileExplorer'
import { Button } from '@/components/ui/button'
import { AlertCircle, Eye, EyeClosed, FileText, FolderOpen, Save, Settings, X } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TemplateFile, TemplateFolder } from './types/types'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import PlayGroundCodeEditor from './components/codeview/code-editor'
import { useWebContainer } from '@/features/webcontainer/hooks/useWebContainer'
import WebcontainerPreview from './components/webcontainerView/WebcontainerPreview'
import { findFilePath } from '@/features/playground/lib'
import { toast } from 'sonner'
import AIAgentCompoents from '@/features/FIngAI/components/AIAgentCompoents'
import { useAISuggestion } from '@/features/FIngAI/hooks/useAIFeature'


interface Props {
  playgroundId: string
}

const PlaygroundView = ({ playgroundId }: Props) => {

  const [isPreview, setIsPreview] = React.useState(true)
  const [toggle,setToggle] = React.useState(false)
/*   const lastSyncedContent = useRef<Map<string, string>>(new Map());
 */  const {
     playgroundData,
    templateData,
    isLoading,
    error,
    loadPlayground,
    saveTemplateData,
   /*  isSaving, */
   /*  setTemplateData, */
  } = usePlayground(playgroundId)
  const AI = useAISuggestion();


  const explore = useFileExplorer()
  
  const container = 
  //@ts-ignore
  useWebContainer({templateData});
  const activeFiles = explore.openFiles.find((file) => file.id === explore.activeFileId);
  const hasUnsavedChanges = explore.openFiles.some((file) => file.hasUnsavedChanges)
  const handleFileSelect = (file: TemplateFile) => {
      explore.openFile(file)
  }

  
  
  useEffect(() => {
    if (playgroundId) {
      loadPlayground()
    }
  }, [playgroundId]) // Only depend on playgroundId

   React.useEffect(() => {
    if (templateData && !explore.openFiles.length) {

      
      explore.setTemplateData(templateData);
    }
  }, [templateData, explore.setTemplateData, explore.openFiles.length]);

  
  
const wrappHandleAddFile = useCallback((newFile: TemplateFile, parentPath: string) => {
  return explore.handleAddFile(
    newFile,
    parentPath,
    container.writeFileSync!,
    container.instance,
    saveTemplateData
  )
}, [explore, container.writeFileSync, container.instance, saveTemplateData]); 


const wrapHandleAddFoler = useCallback((newFolder: TemplateFolder, parentPath: string) => {
       return explore.handleAddFolder(
           newFolder,
           parentPath,
           container.instance,
           saveTemplateData
       )
},[explore.handleAddFolder, container.instance, saveTemplateData]);

const wrapHandleDeleteFile = useCallback((file: TemplateFile, parentPath: string) => {
     return explore.handleDeleteFile(
        file, 
        parentPath,
        saveTemplateData
     )
},[explore.handleDeleteFile, saveTemplateData])

const wrapHandleDeleteFolder = useCallback((folder: TemplateFolder, parentPath: string) => {
    return explore.handleDeleteFolder(
       folder,
       parentPath,
       saveTemplateData
    )
},[explore.handleDeleteFolder, saveTemplateData]);

const wrapRenameFile = useCallback(( 
    file: TemplateFile,
    newFilename: string,
    newExtension: string,
    parentPath: string
) => {
   return explore.handleRenameFile(
     file,
     newFilename,
     newExtension,
     parentPath,
     saveTemplateData
   )
},[explore.handleRenameFile, saveTemplateData]);

const wrapRenameFolder = useCallback((
   folder: TemplateFolder,
   newFolderName: string,
   parentPath: string
) => {
    return explore.handleRenameFolder(
       folder,
       newFolderName,
       parentPath,
       saveTemplateData
    )
},[explore.handleRenameFolder, saveTemplateData])

const handleSaveFile = useCallback(async () => {
  if (!activeFiles || !templateData) return;
  
  try {
    console.log('🚀 Starting save process for file:', activeFiles.filename);
    
    // Create a deep copy of templateData
    const updatedTemplateData = structuredClone(templateData);
    
    // Use the recursive approach from the reference code
    const updateFileContent = (items: any[]): any[] => {
      return items.map((item) => {
        if ("folderName" in item) {
          // It's a folder, recurse into its items
          return { ...item, items: updateFileContent(item.items) };
        } else if (
          // It's a file, check if it's the one we want to update
          "filename" in item &&
          item.filename === activeFiles.filename &&
          item.fileExtension === activeFiles.fileExtension
        ) {
          console.log('🔄 Updating file content:', activeFiles.filename);
          return { ...item, content: activeFiles.content };
        }
        return item;
      });
    };

    // Update the template data
    updatedTemplateData.items = updateFileContent(updatedTemplateData.items);
    
    // Find file path for webcontainer sync
    const filePath = findFilePath(activeFiles, updatedTemplateData);
    console.log('📍 File path for webcontainer:', filePath);
    
    // Save to backend - pass the object directly
    console.log('💾 Calling saveTemplateData');
    await saveTemplateData(updatedTemplateData);
    console.log('✅ saveTemplateData completed');
    
    // Sync with webcontainer
    if (container.writeFileSync && filePath) {
      try {
        console.log('🔄 Syncing with webcontainer');
        await container.writeFileSync(filePath, activeFiles.content);
        console.log('✅ Webcontainer sync completed');
      } catch (error) {
        console.error('❌ Failed to sync file to webcontainer:', error);
      }
    }
    
    // Update the file's unsaved changes status
    explore.markFileAsSaved(activeFiles.id);
    console.log('✅ File marked as saved in UI');
    
    toast.success(`Saved ${activeFiles.filename}.${activeFiles.fileExtension}`);
    
  } catch (error) {
    console.error('❌ Error saving file:', error);
    toast.error('Failed to save file');
  }
}, [activeFiles, templateData, saveTemplateData, explore, container.writeFileSync]);

const handleSaveAllFiles = useCallback(async () => {
  if (!templateData || explore.openFiles.length === 0) return;
  
  try {
    console.log('🚀 Starting save all process for', explore.openFiles.length, 'files');
    
    // Create a deep copy of templateData
    const updatedTemplateData = structuredClone(templateData);
    let savedCount = 0;
    
    // Update all unsaved files
    const unsavedFiles = explore.openFiles.filter(file => file.hasUnsavedChanges);
    
    if (unsavedFiles.length === 0) {
      toast.info("No unsaved changes");
      return;
    }
    
    // Use recursive approach to update all files
    const updateAllFilesContent = (items: any[]): any[] => {
      return items.map((item) => {
        if ("folderName" in item) {
          // It's a folder, recurse into its items
          return { ...item, items: updateAllFilesContent(item.items) };
        } else if ("filename" in item) {
          // It's a file, check if it's in our unsaved files list
          const unsavedFile = unsavedFiles.find(
            f => f.filename === item.filename && f.fileExtension === item.fileExtension
          );
          
          if (unsavedFile) {
            console.log('🔄 Updating file:', unsavedFile.filename);
            savedCount++;
            return { ...item, content: unsavedFile.content };
          }
        }
        return item;
      });
    };

    // Update the template data
    updatedTemplateData.items = updateAllFilesContent(updatedTemplateData.items);
    
    // Save to backend
    console.log('💾 Calling saveTemplateData for all files');
    await saveTemplateData(updatedTemplateData);
    console.log('✅ saveTemplateData completed for all files');
    
    // Sync each file with webcontainer
    for (const file of unsavedFiles) {
      const filePath = findFilePath(file, updatedTemplateData);
      if (container.writeFileSync && filePath) {
        try {
          await container.writeFileSync(filePath, file.content);
          console.log('✅ Synced file to webcontainer:', filePath);
        } catch (error) {
          console.error('❌ Failed to sync file to webcontainer:', error);
        }
      }
    }
    
    // Mark all files as saved
    explore.markAllFilesAsSaved();
    console.log('✅ All files marked as saved in UI');
    
    toast.success(`Saved ${savedCount} file${savedCount !== 1 ? 's' : ''}`);
    
  } catch (error) {
    console.error('❌ Error saving all files:', error);
    toast.error('Failed to save files');
  }
}, [explore.openFiles, templateData, saveTemplateData, explore, container.writeFileSync]);

// Keyboard shortcut
React.useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      handleSaveFile();
    }
    
    // Ctrl+Shift+S for save all
    if (e.ctrlKey && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      handleSaveAllFiles();
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [handleSaveFile, handleSaveAllFiles]);
  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] p-4">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold text-red-600 mb-2">
          Something went wrong
        </h2>
        <p className="text-gray-600 mb-4">{error}</p>
        <Button onClick={() => window.location.reload()} variant="destructive">
          Try Again
        </Button>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <CustomLoader/>
    );
  }

  // No template data
  if (!templateData) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] p-4">
        <FolderOpen className="h-12 w-12 text-amber-500 mb-4" />
        <h2 className="text-xl font-semibold text-amber-600 mb-2">
          No template data available
        </h2>
        <Button onClick={() => window.location.reload()} variant="outline">
          Reload Template
        </Button>
      </div>
    );
  }

  return (
    <PlaygroundLayout>
      <TooltipProvider>
       <>
       {templateData && (
            <div className="mt-4">
               <TemplateTree
               data={templateData}
               title={"File Explorer"}
               onFileSelect={handleFileSelect}
               selectedFile={activeFiles}
               onAddFile={wrappHandleAddFile}
               onAddFolder={wrapHandleAddFoler}
               onDeleteFile={wrapHandleDeleteFile}
               onDeleteFolder={wrapHandleDeleteFolder}
               onRenameFile={wrapRenameFile}
               onRenameFolder={wrapRenameFolder}
              
               />
            </div>
          )}
        <SidebarInset>
           <header className="flex items-center h-16 shrink-0 gap-2 border-b px-4">
            <SidebarTrigger className='-ml-1' />
            <Separator orientation='vertical' className='mr-2 h-4' />
            <div className='flex flex-1 items-center gap-2'>
              <div className='flex flex-col flex-1'>
                <h2 className="font-bold font-mono text-xs">
                  {playgroundData?.title || "react"}
                </h2>
                <p className='font-mono text-xs opacity-80'>
                    {explore.openFiles.length} File (s) open
                    {hasUnsavedChanges && "⚪️ unsaved"}
                </p>
              </div>

              <div className='flex items-center gap-2'>
                <Tooltip>
                    <TooltipTrigger asChild>
                         <Button
                          size={"sm"}
                          variant={"outline"}
                          disabled={!activeFiles?.hasUnsavedChanges}
                          onClick={() => handleSaveFile()}
                         >
                           <Save className='size-4'/>
                         </Button>
                    </TooltipTrigger>
                    <TooltipContent>save (Ctrl+s)</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                         <Button
                          className='font-mono'
                          size={"sm"}
                          variant={"outline"}
                          disabled={!hasUnsavedChanges}
                          onClick={handleSaveAllFiles}
                         >
                           <Save className='size-4'/> All
                         </Button>
                    </TooltipTrigger>
                    <TooltipContent>save all (Ctrl+Shift+s)</TooltipContent>
                </Tooltip>

                {/* TODO:TOGGLE AI */}

                <AIAgentCompoents
                 isEnabled={AI.isEnabled}
                 suggestionOnLoading={AI.isLoading}
                 onToggle={AI.toggleEnabled}

                /> 
              <Tooltip>

                 <DropdownMenu>
                    <DropdownMenuTrigger asChild >
                        <Button  className='font-mono'
                          size={"sm"}
                          variant={"outline"}>
                            <Settings  />
                        </Button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent className='font-mono' align='end'>
                        <DropdownMenuItem
                          onClick={() => setIsPreview(!isPreview)}
                        >
                          {
                            isPreview ? ( <EyeClosed className='size-3'/>) : (<Eye className='size-3'/>)
                          }
                           {
                            isPreview ? "Hide" : "Preview"
                           }
                        </DropdownMenuItem>
                         <Separator/>
                        <DropdownMenuItem onClick={() => explore.closeAllFiles()}>
                            <X className='size-3'/>
                            Close All Files
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                 </DropdownMenu>
                 <TooltipContent>Settings</TooltipContent>
              </Tooltip>
              </div>
            </div>
          </header> 
          
         <div className='h-[calc(100vh-4rem)] '>
            {
                explore.openFiles.length > 0 ? (
                  <div className='flex flex-col h-full'>
                    <div className='border-b bg-muted/30' >
                         <Tabs
    value={explore.activeFileId || ""}
    onValueChange={explore.setActiveFileId}
  >
    <div className='flex items-center justify-between px-4 py-2'>
      <TabsList className='h-8 bg-transparent flex items-center gap-0'> {/* Changed gap-2 to gap-0 */}
        {explore.openFiles.map((files) => (
          <TabsTrigger
            asChild
            className='relative h-8 px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm group'
            value={files.id} 
            key={files.id}
          >
            <div className='flex items-center gap-1'>
              <FileText className='size-4'/>
              <span>{files.filename}.{files.fileExtension}</span>
              {files.hasUnsavedChanges && (
                <span className='h-2 w-2 rounded-full bg-pink-500' />
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 ml-1 opacity-0 group-hover:opacity-100 hover:bg-transparent"
                onClick={(e) => {
                  e.stopPropagation(); // Prevent tab switching when clicking close
                  explore.closeFile(files.id);
                }}
              >
                <X className="h-3 w-3 text-pink-500" />
              </Button>
            </div>
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  </Tabs>
                    </div>
<div className='flex-1 overflow-auto'>
    <ResizablePanelGroup
     direction='horizontal'
     className='h-full'
    >
        <ResizablePanel
         defaultSize={isPreview ? 50 : 100}
        >
        {activeFiles && (
                          <PlayGroundCodeEditor
                            suggestion={AI.suggestion}
                            suggestionLoading={AI.isLoading}
                            suggestionPosition={AI.position}
                            onAcceptSuggestion={(editor, monaco) => AI.acceptSuggestion(editor, monaco)}
                            onRejectSuggestion={(editor) => AI.rejectSuggestion(editor)}
                            onTriggerSuggestion={(type,editor) => AI.fetchSuggestion(type,editor)}
                            
                            activeFile={activeFiles}
                            content={activeFiles?.content}
                            onContentChange={(value) => {
                              if (explore.activeFileId) {
                                explore.updateFileContent(explore.activeFileId, value)
                              }
                            }}
                          />
                        )}
        </ResizablePanel>
       
       {
        isPreview && (
            <>
            <ResizableHandle/>
            <ResizablePanel defaultSize={50}>
               
             <WebcontainerPreview
              templateData={templateData!}
              error={container.error}
              instance={container.instance}
              isLoading={container.isLoading}
              serverUrl={container.serverUrl!}
              writeFileSync={container.writeFileSync}
              forceResetup={false}
             />
            </ResizablePanel>
            </>
        )
       }
    </ResizablePanelGroup>
</div>
                  </div>
                ) : (
                    <div className='flex flex-col justify-center h-full items-center flex-1'>
                     <FileText className='size-30' />
                     <div className='flex flex-col mt-3 items-center'>
                        <p className='font-mono'>No file open</p>
                        <p className='font-mono'>Select a file to open</p>
                     </div>
                    </div>
                )
            }
         </div>
        </SidebarInset>
       </>
      </TooltipProvider>
    </PlaygroundLayout>
  )
}

export default PlaygroundView