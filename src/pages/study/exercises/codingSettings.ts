import { MAX_CODE_BYTES } from '../playground/runner'
import { readEditorAppearance, type EditorAppearance } from './editorAppearance'
import { JUDGE_LANGUAGES, type ExLang, type Exercise } from './types'

export interface CodingSettings {
  preferredLanguage: ExLang | null
  templates: Partial<Record<ExLang, string>>
  appearance: EditorAppearance
}

const PREFIX = 'coms-coding-settings:v1:'
const bytes = (code: string) => new TextEncoder().encode(code).length

const isLanguage = (value: unknown): value is ExLang =>
  typeof value === 'string' && JUDGE_LANGUAGES.some((language) => language === value)

const isAppearance = (value: unknown): value is EditorAppearance => {
  if (!value || typeof value !== 'object') return false
  const { palette, fontSize, wrap } = value as Partial<EditorAppearance>
  return (palette === 'midnight' || palette === 'paper' || palette === 'contrast') &&
    (fontSize === 14 || fontSize === 16 || fontSize === 18 || fontSize === 20) && typeof wrap === 'boolean'
}

export function readCodingSettings(studentId: string | undefined): CodingSettings {
  const fallback: CodingSettings = { preferredLanguage: null, templates: {}, appearance: readEditorAppearance() }
  if (!studentId) return fallback
  try {
    const stored = JSON.parse(localStorage.getItem(PREFIX + studentId) ?? 'null') as Partial<CodingSettings> | null
    if (!stored || typeof stored !== 'object') return fallback
    const templates: CodingSettings['templates'] = {}
    for (const lang of JUDGE_LANGUAGES) {
      const code = stored.templates?.[lang]
      if (typeof code === 'string' && code.trim() && bytes(code) <= MAX_CODE_BYTES) templates[lang] = code
    }
    return {
      preferredLanguage: isLanguage(stored.preferredLanguage) ? stored.preferredLanguage : null,
      templates,
      appearance: isAppearance(stored.appearance) ? stored.appearance : fallback.appearance,
    }
  } catch {
    return fallback
  }
}

export function saveCodingSettings(studentId: string | undefined, settings: CodingSettings): boolean {
  if (!studentId || !isAppearance(settings.appearance) ||
      (settings.preferredLanguage !== null && !isLanguage(settings.preferredLanguage))) return false
  const templates: CodingSettings['templates'] = {}
  for (const lang of JUDGE_LANGUAGES) {
    const code = settings.templates[lang]
    if (code === undefined) continue
    if (typeof code !== 'string' || bytes(code) > MAX_CODE_BYTES) return false
    if (code.trim()) templates[lang] = code
  }
  try {
    localStorage.setItem(PREFIX + studentId, JSON.stringify({ ...settings, templates }))
    return true
  } catch {
    return false
  }
}

export function problemStarter(problem: Exercise, lang: ExLang, settings: CodingSettings): string {
  return (problem.mode === 'stdio' ? settings.templates[lang] : undefined) ?? problem.starter[lang] ?? ''
}

export function chooseCodingLanguage(languages: ExLang[], requested: string | null, preferred: ExLang | null, fallback: string): ExLang {
  for (const candidate of [requested, preferred, fallback]) {
    if (isLanguage(candidate) && languages.includes(candidate)) return candidate
  }
  return languages[0] ?? 'c'
}

export const exampleCodingTemplates: Record<ExLang, string> = {
  c: '#include <stdio.h>\n\nint main(void) {\n    // 입력을 읽고 답을 출력하세요.\n    return 0;\n}\n',
  cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // 입력을 읽고 답을 출력하세요.\n    return 0;\n}\n',
  java: 'import java.io.*;\nimport java.util.*;\n\npublic class Main {\n    public static void main(String[] args) throws Exception {\n        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));\n        // 입력을 읽고 답을 출력하세요.\n    }\n}\n',
  python: 'import sys\n\ndef solve():\n    # 입력을 읽고 답을 출력하세요.\n    data = sys.stdin.buffer.read().split()\n\nif __name__ == "__main__":\n    solve()\n',
  javascript: "const fs = require('node:fs');\nconst input = fs.readFileSync(0, 'utf8').trim();\n// 입력을 읽고 답을 출력하세요.\n",
}
