function isComsHosted(linkUrl) {
  try {
    const url = new URL(linkUrl)
    return url.hostname === 'coms.kw.ac.kr'
  } catch {
    return false
  }
}

/**
 * What the server's last look at this entry's link found: 'UP', 'DOWN' or 'UNKNOWN', or null
 * when it has not looked, or looked at an address the entry no longer has.
 */
export function linkStateOf(project, statuses) {
  if (!project?.linkUrl || !Array.isArray(statuses)) return null
  const status = statuses.find((entry) => String(entry?.projectId) === String(project.id))
  if (!status || String(status.linkUrl ?? '').trim() !== String(project.linkUrl).trim()) return null
  return ['UP', 'DOWN', 'UNKNOWN'].includes(status.state) ? status.state : null
}

export function buildProjectStatusBadges(project, linkState = null) {
  const badges = []
  const hasLink = Boolean(project?.linkUrl)
  const hasFiles = Array.isArray(project?.files) && project.files.length > 0

  if (hasLink) {
    // A link that did not answer is not "열기 가능", whatever the entry says.
    badges.push(linkState === 'DOWN'
      ? { key: 'down', label: '응답 없음', tone: 'down' }
      : { key: 'open', label: '열기 가능', tone: 'ready' })
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
