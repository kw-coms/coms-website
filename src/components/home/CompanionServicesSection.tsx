import { useEffect, useState } from 'react'
import { listClubProjects, listClubProjectCategories } from '../../services/clubProjectApi'
import { companionServices } from '../../data/homeContent'
import AppProjectCard from '../apps/AppProjectCard'

const DEFAULT_MADE_BY = '최준혁'

// Graceful fallback used when the backend is unavailable (mirrors how other
// sections degrade). Built from the original hardcoded companionServices so the
// section keeps rendering the same links offline.
const FALLBACK_CATEGORIES = [
  { key: 'WEBSITE', name: '웹사이트' },
  { key: 'APP', name: '앱' },
  { key: 'GAME', name: '게임' },
]

const FALLBACK_PROJECTS = companionServices.map((service, index) => ({
  id: `fallback-${index}`,
  category: service.title === 'Game Club' ? 'GAME' : 'WEBSITE',
  categoryName: service.title === 'Game Club' ? '게임' : '웹사이트',
  title: service.title,
  description: service.body,
  eyebrow: service.eyebrow,
  madeBy: DEFAULT_MADE_BY,
  linkUrl: service.href,
  displayUrl: service.domain,
  files: [],
}))

function groupByCategory(projects, categories) {
  const order = categories.length > 0 ? categories : FALLBACK_CATEGORIES
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
  const [projects, setProjects] = useState(FALLBACK_PROJECTS)
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES)

  useEffect(() => {
    let mounted = true
    Promise.all([listClubProjects(), listClubProjectCategories()])
      .then(([projectData, categoryData]) => {
        if (!mounted) return
        const projectList = Array.isArray(projectData) ? projectData : []
        const categoryList = Array.isArray(categoryData) ? categoryData : []
        // Only replace the fallback when the API actually returns content.
        if (projectList.length > 0) setProjects(projectList)
        if (categoryList.length > 0) setCategories(categoryList)
      })
      .catch(() => {
        // Keep the fallback when the backend is unavailable.
      })
    return () => { mounted = false }
  }, [])

  const groups = groupByCategory(projects, categories)

  return (
    <section className="bg-white px-5 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-2xl">
          <p className="apple-eyebrow">Service launcher</p>
          <h2 className="apple-display mt-3 text-4xl sm:text-5xl">COM&apos;s Apps</h2>
          <p className="apple-copy mt-4 text-lg">
            동아리 부원들이 직접 만든 웹사이트·앱·게임 프로젝트를 한곳에 모았습니다. 카테고리별로 살펴보고, 링크로 바로 열거나 배포 파일을 내려받아 사용해 보세요.
          </p>
        </div>

        {groups.length === 0 ? (
          <p className="mt-8 text-sm font-medium text-[#6e6e73]">등록된 프로젝트가 아직 없습니다.</p>
        ) : (
          <div className="mt-10 space-y-12">
            {groups.map((group) => (
              <div key={group.key}>
                <div className="flex items-baseline gap-3">
                  <h3 className="text-2xl font-bold text-[#1d1d1f]">{group.name}</h3>
                  <span className="text-sm font-semibold text-[var(--app-subtle)]">{group.projects.length}개</span>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.projects.map((project) => (
                    <AppProjectCard key={project.id} project={project} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

export default CompanionServicesSection
