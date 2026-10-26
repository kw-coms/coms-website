// Link-preview metadata for the public pages.
//
// The site is one SPA with one index.html, so every shared link — /recruit in a KakaoTalk
// chat, /apps on Slack — used to unfurl as the home page: crawlers read the HTML and never run
// the app. The build (vite.config.js) writes one <path>.html per page below with its own
// title, description and canonical URL, and nginx serves it before falling back to index.html.
// The app itself is identical in every copy.

export const SITE_URL = 'https://coms.kw.ac.kr'

export interface PublicPageMeta {
  path: string
  /** Tab title, in the "<label> | KW COM's" form documentTitleFor() uses at runtime. */
  title: string
  description: string
}

export const PUBLIC_PAGE_META: PublicPageMeta[] = [
  {
    path: '/about',
    title: "동아리 소개 | KW COM's",
    description: "COM's는 광운대학교 학생들이 컴퓨터와 소프트웨어를 함께 공부하고, 실제 프로젝트로 연결하는 중앙 컴퓨터 학술동아리입니다.",
  },
  {
    path: '/activities',
    title: "활동 | KW COM's",
    description: '정기 세미나, 분야별 스터디, 코드 리뷰, 작은 제작 과제로 이어지는 COM\'s의 활동을 소개합니다.',
  },
  {
    path: '/projects',
    title: "프로젝트 | KW COM's",
    description: '동아리 안에서 쓰이는 서비스부터 교육용 실습까지, COM\'s 부원들이 팀으로 만든 프로젝트를 소개합니다.',
  },
  {
    path: '/apps',
    title: "Apps | KW COM's",
    description: '부원들이 직접 만든 웹사이트·앱·게임 프로젝트를 한곳에서 열어 보세요.',
  },
  {
    path: '/sponsors',
    title: "후원자 | KW COM's",
    description: 'COM\'s의 활동을 함께 만들어 주신 후원자분들을 소개합니다.',
  },
  {
    path: '/recruit',
    title: "지원하기 | KW COM's",
    description: '로그인 없이 COM\'s 지원서를 작성하고, 학번과 이름으로 지원 현황을 확인하세요.',
  },
  {
    path: '/recruit-notice',
    title: "모집 공지 | KW COM's",
    description: 'COM\'s 신입 부원 모집 일정과 지원 안내를 확인하세요.',
  },
  {
    path: '/draw',
    title: "뽑기 | KW COM's",
    description: '이름을 넣고 조를 나누거나, 발표 순서를 정하거나, 한 명을 뽑습니다. 입력한 이름은 브라우저 밖으로 나가지 않습니다.',
  },
]

function escapeAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeText(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function replaceMetaContent(html: string, attribute: 'name' | 'property', key: string, content: string) {
  const pattern = new RegExp(`(<meta\\s+${attribute}="${key}"\\s+content=")[^"]*(")`)
  if (!pattern.test(html)) throw new Error(`index.html has no <meta ${attribute}="${key}">`)
  return html.replace(pattern, `$1${escapeAttribute(content)}$2`)
}

/** index.html rewritten for one public page. Throws if index.html lost a tag it relies on. */
export function renderPublicPageHtml(indexHtml: string, page: PublicPageMeta): string {
  const url = `${SITE_URL}${page.path}`
  let html = indexHtml
  if (!/<title>[^<]*<\/title>/.test(html)) throw new Error('index.html has no <title>')
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeText(page.title)}</title>`)
  html = replaceMetaContent(html, 'name', 'description', page.description)
  html = replaceMetaContent(html, 'property', 'og:title', page.title)
  html = replaceMetaContent(html, 'property', 'og:description', page.description)
  html = replaceMetaContent(html, 'property', 'og:url', url)
  const canonical = /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/
  if (!canonical.test(html)) throw new Error('index.html has no <link rel="canonical">')
  html = html.replace(canonical, `<link rel="canonical" href="${escapeAttribute(url)}" />`)
  return html
}
