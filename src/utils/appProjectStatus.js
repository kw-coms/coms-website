function isComsHosted(linkUrl) {
  try {
    const url = new URL(linkUrl)
    return url.hostname === 'coms.kw.ac.kr'
  } catch {
    return false
  }
}

export function buildProjectStatusBadges(project) {
  const badges = []
  const hasLink = Boolean(project?.linkUrl)
  const hasFiles = Array.isArray(project?.files) && project.files.length > 0

  if (hasLink) {
    badges.push({ key: 'open', label: '열기 가능', tone: 'ready' })
    badges.push(isComsHosted(project.linkUrl)
      ? { key: 'coms', label: 'COMS 호스팅', tone: 'hosted' }
      : { key: 'external', label: '외부 링크', tone: 'external' })
  }
  if (hasFiles) {
    badges.push({ key: 'download', label: '다운로드', tone: 'download' })
  }
  if (!hasLink && !hasFiles) {
    badges.push({ key: 'draft', label: '준비 중', tone: 'draft' })
  }

  return badges
}
