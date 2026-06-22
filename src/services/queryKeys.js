export const queryKeys = {
  admin: {
    all: ['admin'],
    members: () => [...queryKeys.admin.all, 'members'],
  },
  community: {
    all: ['community'],
    posts: () => [...queryKeys.community.all, 'posts'],
  },
}
