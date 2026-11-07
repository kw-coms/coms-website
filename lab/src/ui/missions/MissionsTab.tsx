import { useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Circle, Lightbulb, Loader2, Play } from 'lucide-react';
import { MISSIONS, checkMission, type CheckerStep, type Mission } from '../../missions';
import { PARTS } from '../core';
import { compileSketch } from '../compileClient';
import { confirmReplace } from '../actions';
import { stop } from '../simHost';
import { getState, loadScene, saveMissionProgress, scene, set, setMissionId, toast, useStore } from '../store';

const OPS: Record<string, string> = { eq: '=', gte: '≥', lte: '≤', between: '~' };
/** Korean one-liner for a checker step (the checker itself is a declarative list). */
export function describeStep(s: CheckerStep): string {
  switch (s.kind) {
    case 'setInput': return `${s.partId} ${s.key} = ${String(s.value)} 로 조작`;
    case 'run': return `${s.ms}ms 동안 실행`;
    case 'expectPart': return `${s.partId} 의 ${s.path} ${OPS[s.op] ?? s.op} ${String(s.value)}${s.op === 'between' ? `~${s.max}` : ''}`;
    case 'expectPin': return `핀 ${s.pin} 의 ${s.field} ${OPS[s.op] ?? s.op} ${s.value}${s.op === 'between' ? `~${s.max}` : ''}`;
    case 'expectSerial': return `시리얼에 “${s.includes}” 출력`;
    case 'expectSerialNumber': return `시리얼 “${s.prefix}” 값이 ${s.min}~${s.max}`;
    case 'expectTransitions': return `${s.partId} 의 ${s.path} 가 ${s.minTransitions}번 이상 바뀜${s.intervalMs ? ` (간격 약 ${s.intervalMs}ms)` : ''}`;
  }
}

export function openMission(m: Mission) {
  if (!confirmReplace('미션 회로를 불러올까요?')) return;
  stop();
  loadScene(structuredClone(m.starterScene));
  setMissionId(m.id);
  set({ sideTab: 'missions', sideOpen: true });
}

function MissionView({ m }: { m: Mission }) {
  const progress = useStore((s) => s.missionProgress[m.id]);
  const [hints, setHints] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ passed: boolean; step: number; message: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const expects = m.checker.map((s, i) => ({ s, i })).filter(({ s }) => s.kind.startsWith('expect'));
  const check = async () => {
    abort.current?.abort();
    const ac = (abort.current = new AbortController());
    setBusy(true);
    setResult(null);
    try {
      const sc = scene();
      const needsHex = sc.code.trim().length > 0 && sc.parts.some((p) => p.kind === 'arduino-uno');
      let hex: string | undefined;
      if (needsHex) {
        const c = await compileSketch(sc.code, ac.signal);
        if (!c.ok) {
          setResult({ passed: false, step: 0, message: `코드를 컴파일하지 못했어요: ${c.errors[0]?.message ?? '알 수 없는 오류'}` });
          return;
        }
        hex = c.hex;
      }
      const r = await checkMission(m, sc, hex, { signal: ac.signal });
      setResult(r);
      saveMissionProgress(m.id, { done: r.passed || !!progress?.done, at: Date.now(), checks: expects.map(({ s, i }) => ({ id: String(i), label: describeStep(s), ok: r.passed || i < r.step, message: '' })) });
      if (r.passed) toast('미션 성공! 🎉');
    } catch (e) {
      if (!(e instanceof DOMException)) setResult({ passed: false, step: 0, message: e instanceof Error ? e.message : '검사 중 오류가 났어요.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mission-view">
      <button type="button" className="link-btn" onClick={() => setMissionId(null)}><ArrowLeft size={14} /> 미션 목록</button>
      <h3>{m.title}{progress?.done && <CheckCircle2 size={16} className="ok" aria-label="완료" />}</h3>
      <p className="story">{m.story}</p>
      <h4>목표</h4>
      <p>{m.goal}</p>
      <h4>쓸 수 있는 부품</h4>
      <p className="chips">{m.allowedParts.map((k) => <span key={k} className={`chip-sm ${m.requiredParts.includes(k) ? 'req' : ''}`}>{PARTS[k]?.title ?? k}</span>)}</p>
      <h4>힌트</h4>
      {hints === 0 && <p className="muted small">막히면 힌트를 하나씩 열어 보세요.</p>}
      <ol className="hints">{m.hints.slice(0, hints).map((h) => <li key={h}>{h}</li>)}</ol>
      {hints < m.hints.length && <button type="button" className="link-btn" onClick={() => setHints(hints + 1)}><Lightbulb size={14} /> 힌트 보기 ({hints}/{m.hints.length})</button>}
      <div className="actions">
        <button type="button" className="primary-btn" onClick={() => void check()} disabled={busy}>{busy ? <><Loader2 size={15} className="spin" /> 확인하는 중…</> : <><Play size={15} /> 확인하기</>}</button>
        <button type="button" onClick={() => openMission(m)}>처음부터 다시</button>
      </div>
      {result && <p role="status" className={`mission-result ${result.passed ? 'pass' : 'fail'}`}>{result.passed ? '성공! ' : ''}{result.message}</p>}
      <h4>확인 항목</h4>
      <ul className="checks" aria-label="확인 항목">
        {expects.map(({ s, i }, n) => {
          const ok = result ? result.passed || i < result.step : false;
          const bad = result && !result.passed && result.step === i + 1;
          return <li key={i} className={ok ? 'ok' : bad ? 'bad' : ''}>{ok ? <CheckCircle2 size={14} /> : <Circle size={14} />}<span>{n + 1}. {describeStep(s)}</span></li>;
        })}
      </ul>
    </div>
  );
}

export function MissionsTab() {
  const id = useStore((s) => s.missionId);
  const progress = useStore((s) => s.missionProgress);
  const m = id ? MISSIONS.find((x) => x.id === id) : undefined;
  if (m) return <MissionView m={m} />;
  const done = MISSIONS.filter((x) => progress[x.id]?.done).length;
  return (
    <div className="mission-list">
      <h3>아두이노 기초 미션</h3>
      <p className="muted small">회로를 만들고 코드를 짜서 목표를 달성해 보세요. 진행 상황은 이 브라우저에 저장돼요. ({done}/{MISSIONS.length} 완료)</p>
      <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={MISSIONS.length} aria-valuenow={done}><i style={{ width: `${(done / Math.max(1, MISSIONS.length)) * 100}%` }} /></div>
      <ul>
        {MISSIONS.map((x, n) => (
          <li key={x.id}>
            <button type="button" className="mission-item" onClick={() => { if (getState().missionId !== x.id) openMission(x); setMissionId(x.id); }}>
              {progress[x.id]?.done ? <CheckCircle2 size={18} className="ok" /> : <Circle size={18} />}
              <span><strong>{n + 1}. {x.title}</strong><small>{x.goal}</small></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
