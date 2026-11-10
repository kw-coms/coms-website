import PageHeading from '../PageHeading'
import { useEffect, useState } from 'react'
import { listClubProjects, listClubProjectCategories, listClubProjectLinkStatuses } from '../../services/clubProjectApi'
import { linkStateOf } from '../../utils/appProjectStatus'
import { useAuth } from '../../contexts/useAuth'
import AppProjectCard from '../apps/AppProjectCard'
import '../../styles/site-pages.css'

function groupByCategory(projects, categories) {
  const order = categories.length > 0 ? categories : []
  const groups = order.map((category) => ({
    key: category.key,
    name: category.name,
    projects: projects.filter((project) => project.category === category.key),
  }))
  // Surface any project whose category is missing from the category list under
  // its own heading so nothing silently disappears.
  const known = new Set(order.map((category) => category.key))
  const leftovers = projects.filter((project) => !known.has(project.category))
  if (leftovers.length > 0) {
    const byKey = new Map()
    for (const project of leftovers) {
      if (!byKey.has(project.category)) {
        byKey.set(project.category, { key: project.category, name: project.categoryName || project.category, projects: [] })
      }
      byKey.get(project.category).projects.push(project)
    }
    groups.push(...byKey.values())
  }
  return groups.filter((group) => group.projects.length > 0)
}

function CompanionServicesSection() {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [categories, setCategories] = useState([])
  const [loadState, setLoadState] = useState('loading')
  const [linkStatuses, setLinkStatuses] = useState([])
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    let mounted = true
    Promise.all([listClubProjects(), listClubProjectCategories()])
      .then(([projectData, categoryData]) => {
        if (!mounted) return
        const projectList = Array.isArray(projectData) ? projectData : []
        const categoryList = Array.isArray(categoryData) ? categoryData : []
        setProjects(projectList)
        setCategories(categoryList)
        setLoadState('ready')
      })
      .catch(() => {
        if (!mounted) return
        setProjects([])
        setCategories([])
        setLoadState('error')
      })
    return () => { mounted = false }
  }, [])

  // Which links answered the server's last look. Members only: guests are not asked and see no
  // status dots. The page does not wait for it and does without it: a failure here only means
  // no app is marked.
  useEffect(() => {
    if (!user) return undefined
    let mounted = true
    listClubProjectLinkStatuses()
      .then((statuses) => { if (mounted) setLinkStatuses(statuses) })
      .catch(() => {})
    return () => { mounted = false }
  }, [user])

  const groups = groupByCategory(projects, categories)
  const shown = filter === 'all' ? groups : groups.filter((group) => group.key === filter)

  return (
    <div className="site-page">
      <div className="site-page-inner">
        <div className="site-head">
          <div>
            <PageHeading>COM&apos;s Apps</PageHeading>
            <p className="site-head-lead">
              동아리 부원들이 직접 만든 웹사이트·앱·게임 프로젝트를 한곳에 모았습니다. 링크로 바로 열거나 배포 파일을 내려받아 사용해 보세요.
            </p>
          </div>
          {groups.length > 0 && (
            <dl className="site-stats">
              <div><dt>프로젝트</dt><dd>{projects.length}</dd></div>
              <div><dt>카테고리</dt><dd>{groups.length}</dd></div>
            </dl>
          )}
        </div>

        {loadState === 'error' ? (
          <p className="mt-8 text-sm font-medium text-[color-mix(in_srgb,var(--app-danger)_65%,var(--app-text))]">프로젝트를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
        ) : groups.length === 0 ? (
          <p className="mt-8 text-sm font-medium text-[var(--app-muted)]">등록된 프로젝트가 아직 없습니다.</p>
        ) : (
          <>
            {groups.length > 1 && (
              <div className="apps-filter" role="group" aria-label="카테고리 필터">
                <button type="button" className="apps-chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
                  전체 <span>{projects.length}</span>
                </button>
                {groups.map((group) => (
                  <button key={group.key} type="button" className="apps-chip" aria-pressed={filter === group.key} onClick={() => setFilter(group.key)}>
                    {group.name} <span>{group.projects.length}</span>
                  </button>
                ))}
              </div>
            )}
            <div className={`mt-8${projects.some((project) => project.files?.length) ? ' apps-has-files' : ''}`}>
              {shown.map((group) => (
                <section key={group.key} className="apps-group">
                  <div className="apps-group-head">
                    <h3>{group.name}</h3>
                    <span>{group.projects.length}개</span>
                  </div>
                  <div className="apps-grid">
                    {group.projects.map((project) => (
                      <AppProjectCard key={project.id} project={project} linkState={linkStateOf(project, user ? linkStatuses : [])} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default CompanionServicesSection
