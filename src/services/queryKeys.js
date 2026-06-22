export const queryKeys = {
  admin: {
    all: ['admin'],
    members: () => [...queryKeys.admin.all, 'members'],
  },
}
