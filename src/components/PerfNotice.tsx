import { dismissPerfNotice, usePerfState } from '../utils/perfMode'

// Shown once when "auto" turned the lite look on because the machine has no graphics acceleration.
export default function PerfNotice() {
  const { autoLite, preference, mode, noticeDismissed } = usePerfState()
  if (!autoLite || preference !== 'auto' || mode !== 'lite' || noticeDismissed) return null

  const openSettings = () => {
    dismissPerfNotice()
    const panel = document.querySelector('.appearance-control')
    panel?.scrollIntoView({ block: 'center' })
    panel?.querySelector<HTMLElement>('[data-perf-choice]')?.focus({ preventScroll: true })
  }

  return (
    <div className="coms-perf-notice" role="status" aria-live="polite">
      <p>그래픽 가속이 꺼져 있어 가벼운 화면으로 바꿨어요. 설정에서 바꿀 수 있어요.</p>
      <div className="coms-perf-notice-actions">
        <button type="button" onClick={openSettings}>설정 열기</button>
        <button type="button" onClick={dismissPerfNotice}>확인</button>
      </div>
    </div>
  )
}
