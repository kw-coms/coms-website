export type EditorPalette = 'midnight' | 'paper' | 'contrast'
export type EditorFontSize = 14 | 16 | 18 | 20

export interface EditorAppearance {
  palette: EditorPalette
  fontSize: EditorFontSize
  wrap: boolean
}

const STORAGE_KEY = 'coms-judge-editor:v1'
export const defaultEditorAppearance: EditorAppearance = { palette: 'midnight', fontSize: 16, wrap: false }

export function readEditorAppearance(): EditorAppearance {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<EditorAppearance>
    return {
      palette: stored.palette === 'paper' || stored.palette === 'contrast' ? stored.palette : 'midnight',
      fontSize: stored.fontSize === 14 || stored.fontSize === 18 || stored.fontSize === 20 ? stored.fontSize : 16,
      wrap: stored.wrap === true,
    }
  } catch {
    return { ...defaultEditorAppearance }
  }
}
