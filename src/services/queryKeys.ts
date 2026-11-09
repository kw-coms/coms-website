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
  permissions: {
    all: ['permissions'],
    mine: () => [...queryKeys.permissions.all, 'me'],
    matrix: () => [...queryKeys.permissions.all, 'matrix'],
  },
  notices: {
    all: ['notices'],
    list: () => [...queryKeys.notices.all, 'list'],
  },
  sponsors: {
    all: ['sponsors'],
    // The list differs per viewer (members see names, guests see placeholders), so the viewer is part of the key.
    list: (viewer: string) => [...queryKeys.sponsors.all, 'list', viewer],
    page: () => [...queryKeys.sponsors.all, 'page'],
  },
}
