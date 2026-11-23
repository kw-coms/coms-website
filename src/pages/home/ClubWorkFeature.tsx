import { ArrowUpRight } from 'lucide-react'
import circuitExample from '../../assets/circuit-lab-led-example.jpg'

export default function ClubWorkFeature({ priority = false }: { priority?: boolean }) {
  return (
    <a href="/lab/" className="club-work-feature">
      <figure>
        <div className="club-work-feature__picture">
          <img src={circuitExample} alt="Circuit Lab의 아두이노와 브레드보드로 구성한 LED 예제 회로"
            width={1152} height={591} loading={priority ? 'eager' : 'lazy'} decoding="async" />
        </div>
        <figcaption className="club-work-feature__caption">
          <div>
            <span className="club-work-feature__label">COM’s가 만든 실습 도구</span>
            <strong>Circuit Lab</strong>
          </div>
          <span className="club-work-feature__open">직접 실습하기 <ArrowUpRight size={18} aria-hidden="true" /></span>
        </figcaption>
      </figure>
    </a>
  )
}
