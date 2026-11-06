// Markup of each study, one file per registry id (./content/<id>.html). import.meta.glob keeps the
// files lazy (fetched when a study is opened) and, unlike a dynamic import of a fixed path, does
// not break the build when a file is missing: that study then fails to load at runtime.
const fragments = import.meta.glob<string>('./content/*.html', { query: '?raw', import: 'default' })

export function loadStudyHtml(id: string): Promise<string> {
  const load = fragments[`./content/${id}.html`]
  return load ? load() : Promise.reject(new Error(`no content for study ${id}`))
}
