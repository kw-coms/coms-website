import { dismissPerfNotice, usePerfState } from '../utils/perfMode'

// Shown once when "auto" turned the lite look on. The live region is always mounted: a region
// that appears together with its content is often not announced.
export default function PerfNotice() {
  const { autoLite, preference, mode, reason, noticeDismissed } = usePerfState()
  const show = autoLite && preference === 'auto' && mode === 'lite' && !noticeDismissed

  const openSettings = () => {
    dismissPerfNotice()
    const panel = document.querySelector('.appearance-control')
    panel?.scrollIntoView({ block: 'center' })
    panel?.querySelector<HTMLElement>('[data-perf-choice][tabindex="0"]')?.focus({ preventScroll: true })
  }

  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {show && (
        <div className="coms-perf-notice">
          <p>
            {reason === 'frame-rate'
              ? '화면이 버벅여서 가벼운 화면으로 바꿨어요. 설정에서 바꿀 수 있어요.'
              : '그래픽 가속이 꺼져 있어 가벼운 화면으로 바꿨어요. 설정에서 바꿀 수 있어요.'}
          </p>
          <div className="coms-perf-notice-actions">
            <button type="button" onClick={openSettings}>설정 열기</button>
            <button type="button" onClick={dismissPerfNotice}>확인</button>
          </div>
        </div>
      )}
    </div>
  )
}
