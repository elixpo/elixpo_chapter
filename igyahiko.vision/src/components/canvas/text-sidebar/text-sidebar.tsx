'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Toggle } from '@/components/ui/toggle'
import { cn } from '@/lib/utils'
import { TextShape, updateShape } from '@/redux/slices/shapes'
import { useAppSelector } from '@/redux/store'
import { validateHeaderName } from 'http'
import { Bold, Italic, Palette, Strikethrough, Underline } from 'lucide-react'
import React, { useState } from 'react'
import { useDispatch } from 'react-redux'
interface Props {
     isOpen: boolean
}

const fontFamilies = [
  "'Inter', sans-serif",
  "'Poppins', sans-serif",
  "'Nunito', sans-serif",
  "'Fira Code', monospace",
  "'Roboto Mono', monospace",
  "'Playfair Display', serif",
  "'Merriweather', serif",
  "'Segoe UI', sans-serif",
  "'Montserrat Alternates', sans-serif",
  "'Space Grotesk', sans-serif"
];

const TextSideBar = ({
    isOpen
}: Props) => {
  const dispatch = useDispatch()
  const shapeEntities = useAppSelector((s) => s.shapes.shapes.entities)
  const selectedShapes = useAppSelector((s) => s.shapes.selected)

  const selectedTextShape = Object.keys(selectedShapes) 
    .map((id) => shapeEntities[id])
    .find((shape) => shape.type === 'text') as TextShape | undefined
  
  const updateTextProperty = (property: keyof TextShape, value: any) => {
             if(!selectedTextShape) return
             dispatch(
                updateShape({
                     id: selectedTextShape.id,
                     patch: {[property]: value}
                })
             )
  }
   const [colorInput, setColorInput] = useState(selectedTextShape?.fill || '#ffffff')
  const handleColorChange = (color: string) => {
       setColorInput(color)
       if(/^#[0-9A-F]{6}$/i.test(color) ||/^#[0-9A-F]{3}$/i.test(color)) {
            updateTextProperty('fill',color)
       }
  }
  return (
    <div className={
        cn(
            'fixed right-5 top-1/2 transform -translate-y-1/2 w-80 backdrop:blur-xl bg-white/[0.08] border border-white/[0.12] p-3 gap-2 saturate-150 rounded-lg z-15 transition-transform duration-300',
            isOpen  ? 'translate-x-0' : 'translate-x-full'
        )
    }>
   <div className='p-3 flex flex-col gap-5 overflow-y-auto max-h-[calc(100vh - 8rem)]'>
     <div className='space-y-2'>
        <Label className='font-mono text-xs'>Font Family</Label>
        <Select
         value={selectedTextShape?.fontFamily}
         onValueChange={(value) => updateTextProperty('fontFamily', value)}
        >
            <SelectTrigger className='w-full'>
                <SelectValue/>
            </SelectTrigger>
            <SelectContent>
                {
                    fontFamilies.map((font) => (
                         <SelectItem
                          value={font}
                          key={font}
                         >
                            <span style={{fontFamily: font}}>{font.split(',')[0]} </span>
                         </SelectItem>
                    ))
                }
            </SelectContent>
        </Select>
     </div>

     <div className='space-y-2'>
        <Label className='font-mono text-xs'>
            Font Size: {selectedShapes?.fontSize||100}px
        </Label>
        <Slider
         /* value={[selectedTextShape?.fontSize]} */
         onValueChange={([value]) => updateTextProperty('fontSize', value)}
         min={8}
         max={128}
         step={1}
         className='w-full'
        />
     </div>

     <div className='space-y-2'>
         <Label className='font-mono text-xs'>Font Weight: {selectedShapes?.fontWeight || 700} </Label>
         <Slider
          onValueChange={([value]) => updateTextProperty('fontWeight', value)}
          min={100}
          max={900}
          step={100}
          className='w-full'
         />
     </div>

     <div className='space-y-2'>
        <Label className='font-mono text-xs'>Font Style</Label>
       <div className='flex items-center justify-start gap-2'>
         <Toggle
         /*  pressed={selectedTextShape?.fontWeight > 700} */
         onPressedChange={(pressed ) => updateTextProperty('fontWeight', pressed ? 700 : 400)}
         className='data-[state=on]:bg-red-950'

         >
            <Bold className='w-4 h-4 ' />
        </Toggle>

        <Toggle
         className='data-[state=on]:bg-green-950'
         /* pressed={selectedTextShape?.fontStyle === 'italic'} */
         onPressedChange={(pressed) => updateTextProperty('fontStyle', pressed ? 'italic' : 'normal')}
        >
            <Italic className='w-4 h-4' />
        </Toggle>

        <Toggle
       /*  pressed={selectedTextShape?.textDecoration === 'underline'} */
         onPressedChange={(pressed) => updateTextProperty('textDecoration', pressed ? 'underline' : 'normal')}
         className='data-[state=on]:bg-blue-950'
        >
            <Underline className='w-4 h-4'/>
        </Toggle>

         <Toggle
        /*  pressed={selectedTextShape?.textDecoration === 'line-through'}  */
         onPressedChange={(pressed) => updateTextProperty('textDecoration', pressed ? 'line-through' : 'normal')}
         className='data-[state=on]:bg-yellow-950'
        >
            <Strikethrough className='w-4 h-4'/>
        </Toggle>
       </div>
     </div>

     <div className='space-y-2'>
      <Label className='text-xs font-mono'>Letter Spacing: {selectedTextShape?.letterSpacing||100}px</Label>
      <Slider
       min={-2}
       max={10}
       step={0.1}
       className='w-full'
       onValueChange={([value]) => updateTextProperty('letterSpacing', value)}
      />
     </div>

     <div className='space-y-2'>
        <Label className='font-mono flex items-center gap-2 text-xs'>
            <Palette className='w-4 h-4'/>
            Text Color
        </Label>
        <div>
            <Input
             value={colorInput}
             onChange={(e) => handleColorChange(e.target.value)}
             placeholder='#ffffff'
             className='w-full text-xs font-mono placeholder:text-xs placeholder:font-mono'
            />

            <div
             className='rounded border w-10 h-10 mt-4 cursor-pointer'
             style={{backgroundColor: selectedTextShape?.fill || '#ffffff'}}
             onClick={() => {
                 const input = document.createElement('input')
                 input.type = 'color'
                 input.value = selectedTextShape?.fill || '#ffffff'
                 input.onchange = (e) => {
                    const color = (e.target as HTMLInputElement).value
                    setColorInput(color)
                    updateTextProperty('fill', validateHeaderName)
                 }
                 input.click()
             }}
            />
        </div>
     </div>
   </div>
   </div>
  )
}

export default TextSideBar