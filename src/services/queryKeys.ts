export const queryKeys = {
  admin: {
    all: ['admin'],
    members: () => [...queryKeys.admin.all, 'members'],
    analytics: () => [...queryKeys.admin.all, 'analytics'],
  },
  community: {
    all: ['community'],
    posts: () => [...queryKeys.community.all, 'posts'],
    bookmarks: () => [...queryKeys.community.all, 'bookmarks'],
    byAuthor: (studentId) => [...queryKeys.community.all, 'by-author', String(studentId)],
    reputation: (studentId) => [...queryKeys.community.all, 'reputation', String(studentId)],
  },
  notices: {
    all: ['notices'],
    list: () => [...queryKeys.notices.all, 'list'],
  },
  sponsors: {
    all: ['sponsors'],
    list: () => [...queryKeys.sponsors.all, 'list'],
    page: () => [...queryKeys.sponsors.all, 'page'],
  },
}
