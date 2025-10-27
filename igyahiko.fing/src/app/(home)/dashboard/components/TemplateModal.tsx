import React, {  useState } from 'react'
import { TemplateModalProps, templates } from '../types/types'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Check, Clock, Code, Code2, Globe, Plus, Search, Server, Star } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@radix-ui/react-tabs';
import { RadioGroup } from '@/components/ui/radio-group';
import Image from 'next/image';
import { RadioGroupItem } from '@radix-ui/react-radio-group';
import { Button } from '@/components/ui/button';
import { GoNorthStar } from 'react-icons/go';
import GradientButton from '@/components/Custombuttons/GradientButton';


const TemplateModal = ({isOpen,onClose,onSubmit}: TemplateModalProps) => {

  type Category = "fullstack" | "frontend" | "backend" | "all";
  const [step, setStep] = useState<"select" | "configure">("select");
  const [selectedTemplate,setSelectedTemplate] = useState<string | null>();
  const [searchQurey, setSearchQurey] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [projectName,setProjectName] = useState("");

  const filterTemplate = templates.filter((template) => {
     const matchesSearch = 
      template.name.toLowerCase().includes(searchQurey.toLowerCase()) ||    
      template.describtion.toLowerCase().includes(searchQurey.toLowerCase()) ||
      template.tags.some((tag) => 
      tag.toLowerCase().includes(searchQurey.toLowerCase())
    )

     const matchesCategory = category === 'all' || template.category === category 

     return matchesSearch && matchesCategory
  })

  const handleSelectTemplate = (templateId: string) => {
     setSelectedTemplate(templateId)
  }
  
  const handleBack = () => {
      setStep("select")
  }
   const handleCreateProject = () => {
    if (selectedTemplate) {
      const templateMap: Record<
        string,
        "REACT" | "NEXTJS" | "EXPRESS" | "VUE" | "HONO" | "ANGULAR"
      > = {
        react: "REACT",
        nextjs: "NEXTJS",
        express: "EXPRESS",
        vue: "VUE",
        hono: "HONO",
        angular: "ANGULAR",
      };

      const template = templates.find((t) => t.id === selectedTemplate);
      onSubmit({
        title: projectName || `New ${template?.name} Project`,
        template: templateMap[selectedTemplate] || "REACT",
        describtion: template?.describtion,
      });

      console.log(
        `Creating ${projectName || "new project"} with template: ${
          template?.name
        }`
      );
      onClose();
      // Reset state for next time
      setStep("select");
      setSelectedTemplate(null);
      setProjectName("");
    }
  };

  

  const renderStars = (count: number) => {
      return Array(5).fill(0).map((_ , i) => (
         <Star key={i} size={14} className={ i < count ? "fill-pink-500" : "text-neutral-300"} />
      ))
  }
 /*  const onCreate = () => {
     if(selectedTemplate) {
         setStep("configure")
     }
  }
 */
  

  return (
     <Dialog   open={isOpen} onOpenChange={(open) => {
         if(!open) {
             onClose()
             setStep("select")
             setSelectedTemplate(null)
             setProjectName("");
         }
     }}  >
       <DialogContent className='dark:bg-neutral-950 sm:max-w-[800px] max-h-[90vh] overflow-y-auto' >
        {
            step === 'select' ? (
            <>
            <DialogHeader>
            <DialogTitle>
               <div className='flex items-center gap-2'>
                 <Plus className='text-pink-500' size={24} />
                 <span style={{fontFamily: "monospace"}} className='font-bold text-2xl '>Select a Template</span>
               </div>
                
            </DialogTitle>

            <DialogDescription>
                <span className='text-xs font-mono'>Choose a template to create your new playground</span>
            </DialogDescription>
        </DialogHeader>

        <div className='flex flex-col gap-6 py-4'>
            <div className='flex flex-col sm:flex-row gap-4'>
                   <div className="relative  flex-1">
  {/* Search Icon */}
  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
    <Search size={20} />
  </div>

  {/* Input Field */}
  <Input
    value={searchQurey}
    onChange={(e) => setSearchQurey(e.target.value)}
    className="pl-12 py-6 w-full rounded-lg border border-white/15 placeholder:font-mono text-xs"
    placeholder="Search your project"
    
  />
</div>

       <Tabs
  defaultValue="all"
  onValueChange={(value) => setCategory(value as Category)}
  className="w-full sm:w-auto"
>
  <TabsList className="w-full sm:w-[420px] grid grid-cols-4 gap-2 rounded-md dark:bg-neutral-900 p-1 shadow-sm">
    <TabsTrigger
      value="all"
      className="dark:data-[state=active]:bg-neutral-800 data-[state=active]:shadow-sm data-[state=active]:text-pink-500 rounded-md py-2 text-sm font-medium transition-all duration-200"
    >
     <span className='font-mono'>All</span>
    </TabsTrigger>
    <TabsTrigger
      value="fullstack"
      className="dark:data-[state=active]:bg-neutral-800 data-[state=active]:shadow-sm data-[state=active]:text-pink-500 rounded-md py-2 text-sm font-medium transition-all duration-200"
    >
       <span className='font-mono'>Fullstack</span>
    </TabsTrigger>
    <TabsTrigger
      value="frontend"
      className="dark:data-[state=active]:bg-neutral-800 data-[state=active]:shadow-sm data-[state=active]:text-pink-500 rounded-md py-2 text-sm font-medium transition-all duration-200"
    >
       <span className='font-mono'>Frontend</span>
    </TabsTrigger>
    <TabsTrigger
      value="backend"
      className="dark:data-[state=active]:bg-neutral-800 data-[state=active]:shadow-sm data-[state=active]:text-pink-500 rounded-md py-2 text-sm font-medium transition-all duration-200"
    >
       <span className='font-mono'>Backend</span>
    </TabsTrigger>
  </TabsList>
</Tabs>
 </div>
    <RadioGroup>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-3' >
        {
             filterTemplate.length > 0 ? (
                filterTemplate.map((template) => {
                     return (
                        <div 
                         onClick={() => handleSelectTemplate(template.id)}
                        key={template.id} className={`relative flex p-6 border dark:bg-neutral-900 rounded-lg cursor-pointer
                          transition-all duration-300 hover:scale-[1.02]
                          ${
                            selectedTemplate === template.id
                              ? "border-[#a9a9a9]  shadow-[0_0_0_1px_#FF4F7D,0_8px_20px_rgba(255,79,125,0.15)]"
                              : "hover:border-[#ffffff] shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.1)]"
                          }`}>
                        <div className='flex items-center gap-3'>
                           <div className='w-25 dark:bg-neutral-700 h-13 p-2 rounded-full'>
                             <Image alt='logo' src={template.icon} className='w-[100%] h-[100%] object-contain' /> 
                           </div>
                            <div className='flex flex-col gap-1'>
                               <div className='flex pr-5 items-center justify-between'>
                                <div className='flex items-center gap-1'>
                                     <span className='font-mono font-bold text-md'>{template.name}</span>
                                      <div className="flex gap-1">
                                {template.category === "frontend" && (
                                  <Code size={14} className="text-blue-500" />
                                )}
                                {template.category === "backend" && (
                                  <Server
                                    size={14}
                                    className="text-green-500"
                                  />
                                )}
                                {template.category === "fullstack" && (
                                  <Globe
                                    size={14}
                                    className="text-purple-500"
                                  />
                                )}
                              </div>
                                </div>
                                 <div className='flex'>
                                    {renderStars(template.popularity)}
                                 </div>
                                  {selectedTemplate === template.id && (
                          <div className="absolute top-2 left-2 bg-green-500 text-white rounded-full p-1">
                            <Check size={14} />
                          </div>
                        )}
                               </div>
                                <span className='text-xs font-mono opacity-60'>{template.describtion}</span>

                                <div className="flex flex-wrap gap-2 mt-2">
                              {template.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="text-xs px-2 py-1 border rounded-2xl"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                            </div>
                        
                        
                        

                        </div>
                        <RadioGroupItem
                          value={template.id}
                          id={template.id}
                          className="sr-only"
                        />
                        
                     </div>
                     )
                })
             ) : (
                 <div className="col-span-2 flex flex-col items-center justify-center p-8 text-center">
                      <Search size={48} className="text-gray-300 mb-4" />
                      <h3 className="text-lg font-mono">
                        No templates found
                      </h3>
                      <p className="text-xs font-mono text-muted-foreground">
                        Try adjusting your search or filters
                      </p>
                    </div>
             )
        }
        </div>
    </RadioGroup>

    <div className='flex items-center justify-end gap-5'>
        <div className='flex items-center gap-2'>
            <Clock className='dark:text-muted-foreground size-4'/>

            <span  className='text-xs font-mono dark:text-muted-foreground'>
                Estimate Setup time {""}
                {selectedTemplate ? "2-5 minutes" : "Select a template"}
            </span>
        </div>

        <div className='flex items-center gap-3' >
         <Button onClick={() => onClose() } className='bg-red-600 dark:text-white rounded-none hover:bg-red-700 font-mono' variant={"default"} >Cancel</Button>
         <GradientButton
           onClick={() => setStep('configure')}
         >
            Continue
         </GradientButton>
        </div>
    </div>
 
        </div>


            </>
        ) : 
        
        (<>
         <DialogHeader>
            <DialogTitle>
               <div className='flex items-center gap-2'>
                 <span style={{fontFamily: "monospace"}} className='font-bold text-2xl '>Configure Your Project</span>
               </div>
                
            </DialogTitle>

            <DialogDescription>
                <span className='text-xs font-mono'>{
                    templates.find((t) => 
                    t.id === selectedTemplate
                )?.name} Project Configuration </span>
            </DialogDescription>
        </DialogHeader>

        <div className='flex flex-col '>
           <div className="relative flex-1 flex flex-col gap-2">
  {/* Label */}
  <label 
    htmlFor="projectName" 
    className="text-xs font-mono font-bold ml-2 "
  >
    Project Name
  </label>

  {/* Input Wrapper */}
  <div className="relative">
    {/* Search Icon */}
    <div className="absolute left-4 top-1/2 -translate-y-1/2 ">
      <Code2 size={20} />
    </div>

    {/* Input Field */}
    <Input
      id="projectName"
      value={projectName}
      onChange={(e) => setProjectName(e.target.value)}
      className="pl-12 py-6 w-full rounded-lg border placeholder:font-mono text-xs"
      placeholder="Set a Project name"
    />
  </div>
</div>
      <div className="p-4 mt-3 mb-3  shadow-[0_0_0_1px_#FF4F7D,0_8px_20px_rgba(255,79,125,0.15)]  rounded-lg border">
                <h3 className="font-medium font-mono mb-2">Selected Template Features</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {templates
                    .find((t) => t.id === selectedTemplate)
                    ?.features.map((feature) => (
                      <div key={feature} className="flex items-center gap-2">
                        <GoNorthStar size={14} className="text-pink-500" />
                        <span className="text-sm font-medium font-mono ">{feature}</span>
                      </div>
                    ))}
                </div>
        </div>
            
</div>


    <div className=' flex justify-between'>    
        <Button onClick={handleBack}  className='rounded-none bg-red-600 px-8 font-mono text-white hover:bg-red-700'>
            Back
        </Button>

       <GradientButton
        onClick={handleCreateProject}
       >
        Create Project
       </GradientButton>
       </div>

       
        </>)
        }
       </DialogContent>
     </Dialog>
  )
}

export default TemplateModal