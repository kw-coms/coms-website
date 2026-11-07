import { useEffect, useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import type { Note } from '../core/types';
import { deleteNote, set, updateNote, useStore } from '../ui/store';
import { makeTexture, useOwned } from './parts/common';

const COLORS: Record<NonNullable<Note['color']>, string> = { yellow: '#ffe66d', blue: '#8ecbff', green: '#9be59b', pink: '#ffa6c9' };

function wrap(c: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of para) {
      if (c.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch;
    }
    out.push(line);
  }
  return out;
}

/** A sticky note lying on the desk; text is drawn into a texture. Drag to move, double-click to edit. */
function NoteMesh({ note }: { note: Note }) {
  const col = COLORS[note.color ?? 'yellow'];
  const tex = useOwned(() => makeTexture(256, 256, () => {}), []);
  useEffect(() => {
    const c = (tex.image as HTMLCanvasElement).getContext('2d')!;
    c.fillStyle = col; c.fillRect(0, 0, 256, 256);
    c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(0, 0, 256, 20);
    c.fillStyle = '#2a2417'; c.font = 'bold 26px "Noto Sans KR", sans-serif'; c.textBaseline = 'top';
    wrap(c, note.text, 224).slice(0, 7).forEach((l, i) => c.fillText(l, 16, 30 + i * 30));
    tex.needsUpdate = true;
  }, [tex, note.text, col]);
  return (
    <group position={note.pos} userData={{ noteId: note.id }}>
      <mesh position={[0, 0.4, 0]} rotation-y={0.08} castShadow userData={{ noteId: note.id }}>
        <boxGeometry args={[30, 0.8, 30]} />
        <meshStandardMaterial color={col} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.82, 0]} rotation-x={-Math.PI / 2} rotation-z={-0.08} userData={{ noteId: note.id }}>
        <planeGeometry args={[29.6, 29.6]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

function NoteEditor({ note }: { note: Note }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ta.current?.focus(); ta.current?.select(); }, []);
  return (
    <Html position={[note.pos[0], note.pos[1] + 8, note.pos[2]]} center zIndexRange={[30, 0]}>
      <div className="note-editor" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') set({ editingNote: null }); }}>
        <textarea ref={ta} value={note.text} maxLength={500} aria-label="메모 내용" onChange={(e) => updateNote(note.id, { text: e.target.value })} />
        <div className="note-tools">
          {(Object.keys(COLORS) as (keyof typeof COLORS)[]).map((c) => <button key={c} type="button" aria-label={`메모 색 ${c}`} className="note-sw" style={{ background: COLORS[c] }} onClick={() => updateNote(note.id, { color: c })} />)}
          <button type="button" onClick={() => deleteNote(note.id)}>삭제</button>
          <button type="button" onClick={() => set({ editingNote: null })}>완료</button>
        </div>
      </div>
    </Html>
  );
}

export function Notes() {
  const notes = useStore((s) => s.hist.present.notes);
  const editing = useStore((s) => s.editingNote);
  const list = useMemo(() => notes ?? [], [notes]);
  return (
    <>
      {list.map((n) => <NoteMesh key={n.id} note={n} />)}
      {list.filter((n) => n.id === editing).map((n) => <NoteEditor key={n.id} note={n} />)}
    </>
  );
}
