import React from 'react'

export default function FixedBrackets({ color = '#67e8f9', leftX, rightX } = {}) {

  const imgStyle = {
    display: 'block',
    height: 'clamp(130px, 10vw, 200px)',
    width: 'auto',
    maxWidth: 'none',
    filter: 'drop-shadow(0 0 8px rgba(0,0,0,0.18))',
    willChange: 'transform',
  }

  const BracketSvg = ({ mirrored = false }) => (
    <svg
      viewBox="0 0 187 560"
      aria-hidden="true"
      style={{ ...imgStyle, width: 'clamp(88px, 8vw, 136px)', transform: `${mirrored ? 'scaleX(-1) ' : ''}scaleX(1.55) scaleY(2.5)`, transformOrigin: 'center center' }}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M0 255.674L187 0V48.2058L0 304.49V255.674Z" fill="currentColor" />
      <path d="M0 255.674L187 0V48.2058L0 304.49V255.674Z" fill="currentColor" />
      <path d="M0 255.674L187 0V48.2058L0 304.49V255.674Z" fill="currentColor" />
      <path d="M0 255.674L187 0V48.2058L0 304.49V255.674Z" fill="currentColor" />
      <path d="M0 304.326L187 560V511.794L0 255.51V304.326Z" fill="currentColor" />
      <path d="M0 304.326L187 560V511.794L0 255.51V304.326Z" fill="currentColor" />
      <path d="M0 304.326L187 560V511.794L0 255.51V304.326Z" fill="currentColor" />
      <path d="M0 304.326L187 560V511.794L0 255.51V304.326Z" fill="currentColor" />
      <rect y="258.776" width="29.1902" height="45.7143" fill="currentColor" />
    </svg>
  )

  return (
    <>
      <div
        aria-hidden
        style={{
          position: 'fixed',
          top: '50vh',
          left: typeof leftX === 'number' ? `${leftX}px` : '50%',
          transform: typeof leftX === 'number' ? 'translate(-100%, -50%)' : 'translate(-50%, -50%)',
          color,
          zIndex: 40,
          pointerEvents: 'none',
          transition: 'color .18s',
        }}
      >
        <BracketSvg mirrored={false} />
      </div>

      <div
        aria-hidden
        style={{
          position: 'fixed',
          top: '50vh',
          left: typeof rightX === 'number' ? `${rightX}px` : '50%',
          transform: typeof rightX === 'number' ? 'translate(0, -50%)' : 'translate(-50%, -50%)',
          color,
          zIndex: 40,
          pointerEvents: 'none',
          transition: 'color .18s',
        }}
      >
        <BracketSvg mirrored />
      </div>
    </>
  )
}
