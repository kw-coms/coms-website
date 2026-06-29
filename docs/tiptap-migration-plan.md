# RichEditor → TipTap (ProseMirror) Migration — Design & Phased Plan

> Status: PLAN ONLY (no code). Implementation = dedicated session with manual QA.
> Reason this is big: the community editor is NOT "rich text + separate block model".
> It is a **single `contentEditable`** where inline text and `<figure>` blocks
> (image/video/youtube/poll/file/code) are **interleaved siblings**, serialized by a
> hand-written DOM walker. TipTap/ProseMirror owns its own DOM, so every figure must
> become a ProseMirror node — this is a full editor rewrite, not a swap.

## 1. Current architecture (what must be preserved)

| File | Role |
|---|---|
| `src/pages/community/RichEditor.tsx` | the `contentEditable` div (`divRef`); `execCommand` for inline marks (bold/italic/underline/fontName/foreColor/hiliteColor/createLink); injects `<figure contenteditable="false" data-block-id>` for blocks via `insertFile`/`insertExternalEmbed`/`insertPoll`/`insertCodeBlock`; per-figure state in a `figMeta` Map keyed by `data-block-id`; drag-reorder, resize, align mutate figure DOM in place |
| `src/pages/community/RichEditorSurface.tsx` | Enter → `execCommand('insertLineBreak')`; paste → `execCommand('insertText')` (plaintext); `whitespace-pre` |
| `src/components/richEditor/RichBodyEditor.tsx` | toolbar UI (button group: B/I/U/color/highlight/link/code) |
| `src/pages/community/postEditorUtils.ts` | **`domToBlocks(editorEl, figMeta)`** — THE serialization contract: walks `editorEl.childNodes`, `<figure>` = block boundary, flushes HTML between figures as sanitized `text` blocks, pulls figure state from `figMeta`. `EDITOR_SANITIZE_OPTIONS` + `cleanEditorNode` |
| `src/pages/community/PostEditor.tsx` | composes editor; **upload lifecycle**: pending→saved figures, `updateFigureMeta`, mediaId/fileId wiring; `getBlocks()` → block JSON saved to backend |
| `src/pages/community/PostBlocks.tsx` | **RENDER path** (read side) — turns saved block JSON into displayed post. MUST stay untouched |
| `src/utils/sanitizeHtml.ts` | allowlist + `richText` profile (single source of truth) |
| `src/shared/RichText.tsx` | a SEPARATE, smaller execCommand composer for the home shell — out of community scope, do last |

**The invariant that makes this safe: the saved block-JSON schema must not change.**
Backend storage + `PostBlocks` render + existing posts all depend on it. If the block
JSON for equivalent content is byte-identical before/after, nothing downstream breaks.

## 2. Target ProseMirror model

TipTap `doc` = sequence of block nodes:
- **paragraph / hardBreak / text + marks** for rich text runs. Marks: `bold`→`<strong>`, `italic`→`<em>`, `underline`(`@tiptap/extension-underline`)→`<u>`, `link`(`@tiptap/extension-link`)→`<a>`, color (`@tiptap/extension-text-style` + `extension-color`)→`<span style="color">`, highlight (`extension-highlight`)→keep current `<span style="background-color">` (NOT `<mark>`, to avoid a serialization behavior change — see §5).
- **Custom atom NodeViews** (one per figure type), each a ProseMirror `Node` spec + a React `NodeView` (`ReactNodeViewRenderer`) that renders the EXISTING figure UI + `FigureToolbar`:
  - `imageBlock` — attrs: `blockId, mediaId|pending, src, align, width`
  - `videoBlock` — attrs: `blockId, mediaId|pending, src, align, width`
  - `embedBlock` — attrs: `blockId, kind(youtube|link), url, meta` (the external embed)
  - `fileBlock` — attrs: `blockId, fileId|pending, name, size`
  - `pollBlock` — attrs: `blockId, pollData(question/options/...)`
  - `codeBlock` — TipTap built-in CodeBlock, configured to emit `<pre><code class="language-*">` (matches the sanitizer allowlist + highlight.js render)

NodeView attrs REPLACE the `figMeta` Map (which was keyed by `data-block-id`). Drag-reorder
= ProseMirror's built-in dnd / `Dropcursor` + `Gapcursor`; resize/align = NodeView buttons
mutating node attrs via `updateAttributes`.

## 3. The serialization compatibility layer (the spine — build FIRST)

Two pure functions, golden-file tested, are the safety mechanism:
- `blockJsonToPmDoc(blocks)` — existing saved block JSON → ProseMirror doc JSON (for opening/editing existing posts).
- `pmDocToBlockJson(doc)` — ProseMirror doc → the SAME block JSON shape `domToBlocks` produced (for saving).

Acceptance: for a corpus of real existing posts (export some block JSON from the DB, or
from `PostBlocks` test fixtures), `pmDocToBlockJson(blockJsonToPmDoc(b)) deep-equals b`.
This guarantees backend format + render parity. Build this BEFORE any UI so every later
phase is validated against it.

## 4. Phased plan (each phase independently shippable + QA'd)

- **Phase 0 — Inline spike.** TipTap editor with paragraph + marks only (B/I/U/color/link),
  no blocks. Verify output stays in the sanitizer allowlist and a text-only post
  round-trips through sanitize → `PostBlocks` render identically. Proves the inline layer.
- **Phase 1 — Compat layer (§3).** `blockJsonToPmDoc` / `pmDocToBlockJson` + golden tests.
  Text-only first; extend per block type as those nodes land.
- **Phase 2 — Block nodes, one at a time** (order: codeBlock → fileBlock → imageBlock →
  videoBlock → embedBlock → pollBlock). Each: Node spec + React NodeView reusing existing
  figure UI, plus its branch in the §3 converters + golden test. Ship/QA per block.
- **Phase 3 — Figure interactions.** Drag-reorder, resize, align, `FigureToolbar` on NodeViews.
- **Phase 4 — Upload lifecycle.** Rewire `PostEditor` pending→saved + `updateFigureMeta` +
  mediaId/fileId from `figMeta` Map → node attrs.
- **Phase 5 — Surface parity + cutover.** Paste-as-plaintext, Enter behavior, toolbar wiring
  in `RichBodyEditor`; full parity QA; delete old `RichEditor`/`RichEditorSurface`/execCommand
  + `domToBlocks`.
- **Phase 6 — (optional) `RichText.tsx`** home-shell composer, same mark set.

## 5. Constraints / invariants (do NOT violate)

1. **Saved block-JSON schema unchanged** — verified by §3 golden tests. Backend + `PostBlocks` untouched.
2. **`PostBlocks.tsx` (render) untouched.**
3. **Sanitizer single-source-of-truth**: if any new tag/attr is emitted, add it to BOTH
   `RICH_TEXT_ALLOWED_TAGS`/profiles in `sanitizeHtml.ts` AND `EDITOR_SANITIZE_OPTIONS` in
   `postEditorUtils.ts`. Keep highlight as `<span style="background-color">` (current behavior),
   NOT `<mark>`, unless you also migrate render + accept the change.
4. **Code block** must keep emitting `<pre><code class="language-*">` so highlight.js (render) + the sanitizer class constraint still work.
5. New deps: TipTap packages only (`@tiptap/react`, `@tiptap/starter-kit`, `extension-underline`, `-link`, `-text-style`, `-color`, `-highlight`). Code-split the editor (lazy route chunk) — it's admin/author-only.
6. Each phase: `npm run typecheck && npm run lint && npm run build && npm test` green; manual QA per §6.

## 6. Manual QA checklist (per cutover phase — human, not just CI)

Editor (author): type text; apply/remove bold/italic/underline/color/link on partial + full
selections; nested marks; undo/redo; paste rich text (must become plaintext); paste image;
Enter creates line break not new block; insert each block (image/video/youtube/file/poll/code);
reorder by drag; resize + align an image; delete a block; edit an EXISTING post (opens with all
blocks intact) and re-save (diff the saved block JSON — must be equivalent). 
Render (reader): the saved post displays identically in `PostBlocks`; code blocks highlight;
images/videos/youtube/polls/files all render + function; mobile + desktop; light + dark.
Regression: vote/bookmark/comment still work on the post; share-card unaffected.

## 7. Effort

Multi-day. Phases 0–1 (~spike + compat layer) are the proof-of-viability gate — if the
golden round-trip can't be made to hold, stop and reassess before building NodeViews.
