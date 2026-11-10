import type { ComponentProps } from 'react'
import { useLocation } from 'react-router-dom'
import { useCineReveal } from '../hooks/useSceneProgress'
import { NOT_FOUND_LABEL, routeLabel } from '../routes/pageTitles'

/** Keeps the page's own title, including titles that change while editing. */
export default function PageHeading({ children, className = '', ...props }: ComponentProps<'h1'>) {
  const { pathname } = useLocation()
  useCineReveal(children)
  return (
    <div className="page-heading cine-root">
      <p className="cine-hud page-crumb">COM'S / {routeLabel(pathname) ?? NOT_FOUND_LABEL}</p>
      <h1 {...props} className={`page-title cine-lines ${className}`}>
        <span className="cine-m"><span>{children}</span></span>
      </h1>
    </div>
  )
}
