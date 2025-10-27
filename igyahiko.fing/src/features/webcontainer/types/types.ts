
import { TemplateFolder } from '@/features/playground/lib/path-to-json'
import { WebContainer } from '@webcontainer/api'
export interface UseWebContainerPros { 
    templateData:TemplateFolder
}

export interface UseWebContainerReturn { 
      serverUrl: string | null
      isLoading: boolean
      error: string | null
      instance: WebContainer | null
      writeFileSync: (path: string, content: string) => Promise<void>
      destroy:() => void
}