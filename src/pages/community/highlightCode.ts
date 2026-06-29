/**
 * Lazily highlights `<pre><code>` blocks inside an already-rendered, sanitized
 * post body. highlight.js is loaded via dynamic import so it lands in its own
 * async chunk and never bloats the entry bundle — the cost is only paid when a
 * post actually contains a code block.
 *
 * The common-languages build (`highlight.js/lib/common`) is used instead of the
 * full build to keep that async chunk small. highlight.js operates purely on the
 * existing sanitized DOM text nodes (highlightElement re-tokenizes their text
 * content); it never injects raw author HTML, so it does not widen the
 * sanitizer's surface.
 */
export async function highlightCodeIn(container: HTMLElement | null): Promise<void> {
  if (!container) return
  const blocks = container.querySelectorAll<HTMLElement>('pre code')
  if (blocks.length === 0) return
  const { default: hljs } = await import('highlight.js/lib/common')
  blocks.forEach((block) => {
    // Skip blocks highlight.js has already processed (e.g. on a re-run) so we
    // don't double-highlight and warn in the console.
    if (block.dataset.highlighted === 'yes') return
    hljs.highlightElement(block)
  })
}
