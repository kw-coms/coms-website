import { useEffect, useRef, useState } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { cpp } from '@codemirror/lang-cpp';
import { oneDark } from '@codemirror/theme-one-dark';
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { ChevronDown, ChevronUp, Eraser, Send } from 'lucide-react';
import { sim } from '../simHost';
import { clearSerial, onSerialLog, plot, serialLog } from '../serial';
import { getState, set, setCode, useStore, type SerialTab } from '../store';

const theme = new Compartment();
const lightTheme = EditorView.theme({ '&': { backgroundColor: 'var(--surface)', color: 'var(--text)', height: '100%' }, '.cm-gutters': { backgroundColor: 'var(--surface-2)', color: 'var(--muted)', border: 'none' } });

export function CodeEditor() {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const dark = useStore((s) => s.theme === 'dark');
  const code = useStore((s) => s.code);
  const errors = useStore((s) => s.compile.errors);
  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: getState().code,
        extensions: [
          basicSetup, cpp(), lintGutter(), EditorView.lineWrapping,
          theme.of(getState().theme === 'dark' ? oneDark : lightTheme),
          EditorView.updateListener.of((u) => { if (u.docChanged) setCode(u.state.doc.toString()); }),
          EditorView.contentAttributes.of({ 'aria-label': '아두이노 코드 편집기' }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
  }, []);
  useEffect(() => {
    view.current?.dispatch({ effects: theme.reconfigure(dark ? oneDark : lightTheme) });
  }, [dark]);
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== code) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: code } });
  }, [code]);
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const doc = v.state.doc;
    const diags: Diagnostic[] = (errors ?? []).map((e) => {
      const line = doc.line(Math.min(Math.max(1, e.line), doc.lines));
      return {
        from: line.from, to: Math.max(line.from, line.to), severity: e.severity,
        message: e.hintKo ? `${e.message}\n힌트: ${e.hintKo}` : e.message,
      };
    });
    v.dispatch(setDiagnostics(v.state, diags));
  }, [errors]);
  const compile = useStore((s) => s.compile);
  return (
    <div className="code-wrap">
      <div className="code-host" ref={host} />
      {compile.status === 'error' && (
        <div className="compile-msg" role="alert">
          <strong>{compile.message}</strong>
          {compile.errors?.slice(0, 6).map((e, i) => (
            <div key={i}>{e.line}줄: {e.message}{e.hintKo && <em> — {e.hintKo}</em>}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function useSerialVersion(hz = 10) {
  const [, setV] = useState(0);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = onSerialLog(() => { t ??= setTimeout(() => { t = undefined; setV((v) => v + 1); }, 1000 / hz); });
    return () => { off(); clearTimeout(t); };
  }, [hz]);
}

const ENDINGS = [['', '줄 바꿈 없음'], ['\n', '새 줄 (\\n)'], ['\r', '캐리지 리턴 (\\r)'], ['\r\n', '둘 다 (\\r\\n)']] as const;
export function SerialMonitor() {
  useSerialVersion();
  const [text, setText] = useState('');
  const [ending, setEnding] = useState<string>('\n');
  const [auto, setAuto] = useState(true);
  const pre = useRef<HTMLPreElement>(null);
  useEffect(() => { if (auto && pre.current) pre.current.scrollTop = pre.current.scrollHeight; });
  const send = () => { if (sim.state === 'idle') return; sim.writeSerial(text + ending); setText(''); };
  return (
    <div className="serial">
      <pre ref={pre} className="serial-out" tabIndex={0} aria-label="시리얼 출력" aria-live="off">{serialLog.text || '실행하면 Serial.print 출력이 여기에 나타나요. (9600 baud)'}</pre>
      <form className="serial-bar" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="보낼 텍스트" aria-label="보낼 텍스트" />
        <button type="submit" aria-label="보내기"><Send size={15} /> 보내기</button>
        <select value={ending} onChange={(e) => setEnding(e.target.value)} aria-label="줄 끝 설정">
          {ENDINGS.map(([v, l]) => <option key={l} value={v}>{l}</option>)}
        </select>
        <label className="chk"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 자동 스크롤</label>
        <button type="button" onClick={clearSerial} aria-label="지우기"><Eraser size={15} /> 지우기</button>
      </form>
    </div>
  );
}

const SERIES = ['#2f81f7', '#f0883e', '#3fb950', '#d2a8ff', '#f85149', '#d29922'];
export function Plotter() {
  useSerialVersion(15);
  const cv = useRef<HTMLCanvasElement>(null);
  const darkMode = useStore((s) => s.theme === 'dark');
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, h);
    const style = getComputedStyle(c);
    g.font = '11px sans-serif';
    const all = plot.series.flat();
    if (!all.length) {
      g.fillStyle = style.getPropertyValue('--muted'); g.textAlign = 'center';
      g.fillText('숫자를 한 줄에 하나씩(공백·쉼표·탭으로 여러 값) Serial.println() 하면 그래프가 그려져요.', w / 2, h / 2);
      return;
    }
    let lo = Math.min(...all), hi = Math.max(...all);
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const L = 46, R = 10, T = 8, B = 18;
    g.strokeStyle = style.getPropertyValue('--border'); g.fillStyle = style.getPropertyValue('--muted'); g.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = T + ((h - T - B) * i) / 4;
      g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke();
      g.fillText((hi - ((hi - lo) * i) / 4).toFixed(Math.abs(hi - lo) < 10 ? 2 : 0), L - 5, y + 3);
    }
    plot.series.forEach((s, i) => {
      g.strokeStyle = SERIES[i]!; g.lineWidth = 1.8; g.beginPath();
      s.forEach((v, j) => {
        const x = L + ((w - L - R) * j) / Math.max(1, 299);
        const y = T + (h - T - B) * (1 - (v - lo) / (hi - lo));
        j ? g.lineTo(x, y) : g.moveTo(x, y);
      });
      g.stroke();
    });
  });
  void darkMode;
  return (
    <div className="plotter">
      <canvas ref={cv} aria-label="시리얼 플로터 그래프" />
      <ul className="legend">
        {plot.series.map((s, i) => <li key={i}><i style={{ background: SERIES[i] }} /> {plot.names[i] ?? `값 ${i + 1}`} <b>{s[s.length - 1]}</b></li>)}
        <li><button type="button" onClick={clearSerial}><Eraser size={14} /> 지우기</button></li>
      </ul>
    </div>
  );
}

/** Collapsible, resizable bottom split under the code editor: serial monitor / plotter. */
export function SerialDock() {
  const tab = useStore((s) => s.serialTab);
  const open = useStore((s) => s.serialOpen);
  const h = useStore((s) => s.serialH);
  const drag = useRef<{ y: number; h: number } | null>(null);
  const tabs: [SerialTab, string][] = [['serial', '시리얼 모니터'], ['plotter', '시리얼 플로터']];
  const max = () => Math.max(140, window.innerHeight * 0.6);
  return (
    <section className="serial-dock" aria-label="시리얼 도구" style={open ? { height: h } : undefined}>
      <div
        className="serial-split" role="separator" aria-orientation="horizontal" aria-label="시리얼 영역 크기 조절" tabIndex={0}
        onPointerDown={(e) => { if (!open) return; drag.current = { y: e.clientY, h }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => drag.current && set({ serialH: Math.round(Math.max(90, Math.min(max(), drag.current.h + drag.current.y - e.clientY))) })}
        onPointerUp={() => (drag.current = null)}
        onKeyDown={(e) => { if (e.key === 'ArrowUp') set({ serialH: Math.min(max(), h + 24) }); if (e.key === 'ArrowDown') set({ serialH: Math.max(90, h - 24) }); }}
      />
      <div className="tabs" role="tablist" aria-label="시리얼">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id && open} className={tab === id && open ? 'on' : ''} onClick={() => set({ serialTab: id, serialOpen: true })}>{label}</button>
        ))}
        <button type="button" className="fold" aria-label={open ? '시리얼 영역 접기' : '시리얼 영역 펼치기'} aria-expanded={open} onClick={() => set({ serialOpen: !open })}>
          {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>
      {open && (
        <div className="serial-body">
          {tab === 'serial' ? <SerialMonitor /> : <Plotter />}
        </div>
      )}
    </section>
  );
}
