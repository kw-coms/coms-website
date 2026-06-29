export const queryKeys = {
  admin: {
    all: ['admin'],
    members: () => [...queryKeys.admin.all, 'members'],
    analytics: () => [...queryKeys.admin.all, 'analytics'],
  },
  community: {
    all: ['community'],
    posts: () => [...queryKeys.community.all, 'posts'],
  },
  notices: {
    all: ['notices'],
    list: () => [...queryKeys.notices.all, 'list'],
  },
}
