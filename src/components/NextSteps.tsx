import { Link } from 'react-router-dom'
import { scrollToTopInstant } from '../utils/themeColors'
import { ghostActionBtnClass, solidActionBtnClass } from '../shared/homeUi'

export type NextStep = { label: string; to: string }

/** Where to go after reading a page. The first step is the main one. */
export default function NextSteps({ steps }: { steps: NextStep[] }) {
  return (
    <nav aria-label="다음에 할 일" className="coms-sec coms-sec-low">
      <div className="coms-sec-inner flex flex-wrap justify-center gap-3">
        {steps.map((step, index) => (
          <Link key={step.to} to={step.to} onClick={scrollToTopInstant} className={index === 0 ? solidActionBtnClass : ghostActionBtnClass}>
            {step.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
