// Markup of each study, one file per registry id (./content/<id>.html). import.meta.glob keeps the
// files lazy (fetched when a study is opened) and, unlike a dynamic import of a fixed path, does
// not break the build when a file is missing: that study then fails to load at runtime.
// A Map, not a plain object: the id comes from the URL, and a Map lookup can't reach prototype members.
const fragments = new Map(Object.entries(
  import.meta.glob<string>('./content/*.html', { query: '?raw', import: 'default' }),
))

export function loadStudyHtml(id: string): Promise<string> {
  const load = fragments.get(`./content/${id}.html`)
  return load ? load() : Promise.reject(new Error(`no content for study ${id}`))
}

/** Top-level chapter titles from a study's table of contents (its `.toc` list, entries without `.sub`). Parsed detached: nothing is put in the page. */
export async function loadStudyChapters(id: string): Promise<string[]> {
  const doc = new DOMParser().parseFromString(await loadStudyHtml(id), 'text/html')
  return [...doc.querySelectorAll('.toc ol > li:not(.sub) > a')].map((a) => a.textContent?.trim() ?? '').filter(Boolean)
}
