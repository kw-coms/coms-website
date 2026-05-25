import { useState } from 'react'
import { getLogoAsset } from '../../utils/logoAssets.js'

export default function SplitLogoCard() {
  const [hoveredPiece, setHoveredPiece] = useState(null)

  const top = getLogoAsset('COMs_logo_top')
  const rightBottom = getLogoAsset('COMs_logo_right_bottom')
  const leftBottom = getLogoAsset('COMs_logo_left_bottom')

  const topFilter = 'invert(86%) sepia(23%) saturate(3180%) hue-rotate(145deg) brightness(101%) contrast(104%) drop-shadow(0 0 24px rgba(51, 255, 255, 0.18))'
  const leftFilter = 'invert(80%) sepia(27%) saturate(5410%) hue-rotate(308deg) brightness(103%) contrast(104%) drop-shadow(0 0 22px rgba(255, 79, 216, 0.18))'
  const rightFilter = 'invert(78%) sepia(21%) saturate(4280%) hue-rotate(225deg) brightness(104%) contrast(104%) drop-shadow(0 0 22px rgba(178, 109, 255, 0.18))'

  const clearHover = () => setHoveredPiece(null)

  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[min(90vw,39rem)] select-none"
    >
      <div className="absolute inset-0 -translate-x-[5.2%] translate-y-[2.8%]">
        <div
          className="pointer-events-none absolute left-1/2 top-[37.5%] z-30 w-[180vw] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center font-black uppercase tracking-[-0.1em] text-[var(--theme-white)]"
          style={{
            WebkitTextStroke: '1.5px rgba(255, 255, 255, 0.32)',
            //textShadow: '0 0 12px rgba(255, 255, 255, 0.36), 0 0 36px rgba(255, 255, 255, 0.18)',
            filter: 'drop-shadow(0 0 24px rgba(255, 255, 255, 0.18))',
            fontFamily: 'Orbitron, Segoe UI, sans-serif',
            fontSize: 'clamp(10.8rem, 15.2vw, 16.8rem)',
            lineHeight: '0.72',
          }}
        >
            .K W  C O M &apos; s
        </div>

        <img
          src={top}
          alt="COM's logo top"
          className="absolute left-[55.2%] top-[-14.5%] z-20 w-[100%] object-contain drop-shadow-[0_0_24px_rgba(51,255,255,0.18)] transition-transform duration-150 will-change-transform"
          onPointerEnter={() => setHoveredPiece('top')}
          onPointerLeave={clearHover}
          onPointerCancel={clearHover}
          style={{
            filter: topFilter,
            transform: `translateX(-50%) scale(${hoveredPiece === 'top' ? 1.018 : 1})`,
          }}
        />

        <img
          src={leftBottom}
          alt="COM's logo left bottom"
          className="absolute left-[49%] bottom-[1.85%] z-20 w-[50%] object-contain drop-shadow-[0_0_22px_rgba(255,79,216,0.18)] transition-transform duration-150 will-change-transform"
          onPointerEnter={() => setHoveredPiece('left')}
          onPointerLeave={clearHover}
          onPointerCancel={clearHover}
          style={{
            filter: leftFilter,
            transform: `translateX(-90%) scale(${hoveredPiece === 'left' ? 1.024 : 1})`,
          }}
        />

        <img
          src={rightBottom}
          alt="COM's logo right bottom"
          className="absolute left-[51%] bottom-[2%] z-20 w-[50%] object-contain drop-shadow-[0_0_22px_rgba(124,92,255,0.18)] transition-transform duration-150 will-change-transform"
          onPointerEnter={() => setHoveredPiece('right')}
          onPointerLeave={clearHover}
          onPointerCancel={clearHover}
          style={{
            filter: rightFilter,
            transform: `translateX(10%) scale(${hoveredPiece === 'right' ? 1.024 : 1})`,
          }}
        />
      </div>
    </div>
  )
}
