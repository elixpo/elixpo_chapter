// Scene file actions shared by the app menu, command palette, keyboard
// shortcuts and canvas drag-and-drop: `.lixsketch` (readable DSL) export and
// opening `.lixsketch` / `.lixjson` / `.json` scene files.
import useUIStore from '@/store/useUIStore'
import { showToast } from '@/utils/toast'

function serializer() {
  return typeof window === 'undefined' ? null : window.__sceneSerializer
}

export function saveLixSketchFile() {
  const s = serializer()
  if (!s?.downloadLixSketch) return null
  try {
    const workspaceName = useUIStore.getState().workspaceName || 'Untitled'
    const result = s.downloadLixSketch(workspaceName)
    showToast(`Saved ${result.fileName}`, { tone: 'success', duration: 1800 })
    return result
  } catch (err) {
    console.warn('[SceneFiles] .lixsketch export failed:', err)
    showToast('Could not save the .lixsketch file', { tone: 'warn' })
    return null
  }
}

function reportOpenResult(result, fileName) {
  if (!result) return result
  if (result.success) {
    const warnings = result.warnings?.length ? ` (${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'})` : ''
    showToast(`Opened ${fileName || 'scene'}${warnings}`, { tone: 'success', duration: 1800 })
    if (result.warnings?.length) console.warn('[SceneFiles] warnings:', result.warnings)
  } else if (result.error) {
    showToast(result.error, { tone: 'warn', duration: 5000 })
  }
  return result
}

export async function openSceneFile(file) {
  const s = serializer()
  if (!s?.openFile || !file) return null
  return reportOpenResult(await s.openFile(file), file.name)
}

export async function openSceneFilePicker() {
  const s = serializer()
  if (!s?.upload) return null
  const result = await s.upload()
  return reportOpenResult(result, null)
}

export function isSceneFile(file) {
  const s = serializer()
  return Boolean(file && (s?.isSceneFile ? s.isSceneFile(file.name) : /\.(lixsketch|lixjson)$/i.test(file.name)))
}
