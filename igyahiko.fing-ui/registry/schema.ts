import { string, z} from "zod"

export const blockChunkSchema = z.object({
     name: z.string(),
     description: z.string().optional(),
     components: z.any(),
     file: z.string(),
     code: z.string(),
     container: z.object({
         className: string().nullish()
     }).optional(),
})

export const registryItemSchema = z.enum([
"registry:block",	
"registry:component",	
"registry:lib",
"registry:hook",
"registry:ui",
"registry:page",	
"registry:file",	
"registry:style",	
"registry:theme",	
"registry:item",
])


export const registryItemFileSchema = z.union([
     z.string(),
     z.object({
         path: z.string(),
         content: z.string().optional(),
         type: registryItemSchema,
         target: z.string().optional()
     })
])

export const registrtItemTailwindSchema = z.object({
     config: z.object({
         content: z.array(z.string()).optional(),
         theme: z.record(z.string(),z.any()).optional(),
         plugins: z.array(z.string()).optional()
     })
})

export const registryItemCssVarsSchema = z.object({
     light: z.record(z.string(),z.string()).optional(),
     dark: z.record(z.string(),z.string()).optional()

})


export const entryRegistrySchema = z.object({
     name: z.string(),
     type: registryItemSchema,
     description: z.string().optional(),
     dependencies: z.array(z.string()).optional(),
     devDependencies: z.array(z.string()).optional(),
     registryDependencies: z.array(z.string()).optional(),
     hookDependencies: z.array(z.string()).optional(),
     files: z.array(registryItemFileSchema).optional(),
     tailwind: registrtItemTailwindSchema.optional(),
     cssVars: registryItemCssVarsSchema.optional(),
     source: z.string().optional(),
     category: z.string().optional(),
     subCategory: z.string().optional(),
     chunks: z.array(blockChunkSchema).optional(),
     docs: z.string().optional(),

})

export const registrySchema = z.array(entryRegistrySchema);

export type RegistryEntry = z.infer<typeof entryRegistrySchema>;
export type Registry = z.infer<typeof registrySchema>

export const blockSchema = entryRegistrySchema.extend({
     type: z.literal("registry:block"),
     style: z.enum(["default","new-york"]),
     component: z.any(),
     container: z
     .object({ 
         height: z.string().nullish(),
         className: z.string().nullish()
     })
     .optional(),
     code: z.string().optional(),
     hightLightedCode: z.string(),
})

export type Block = z.infer<typeof blockSchema>

export type BlockChunk = z.infer<typeof blockChunkSchema>