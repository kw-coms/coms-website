import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteMember,
  listMembers,
  resetMemberPassword,
  updateMemberRole,
} from '../../services/adminApi'
import { queryKeys } from '../../services/queryKeys'

const adminMembersQueryKey = queryKeys.admin.members()

export function useAdminMembers() {
  const queryClient = useQueryClient()
  const membersQuery = useQuery({
    queryKey: adminMembersQueryKey,
    queryFn: async () => {
      const data = await listMembers()
      return Array.isArray(data) ? data : []
    },
  })

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: any) => updateMemberRole(id, role),
    onSuccess: (updated) => {
      queryClient.setQueryData(adminMembersQueryKey, (prev) => (
        (Array.isArray(prev) ? prev : []).map((member) => (member.id === updated.id ? updated : member))
      ))
      queryClient.invalidateQueries({ queryKey: adminMembersQueryKey })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteMember(id),
    onSuccess: (_result, id) => {
      queryClient.setQueryData(adminMembersQueryKey, (prev) => (
        (Array.isArray(prev) ? prev : []).filter((member) => member.id !== id)
      ))
      queryClient.invalidateQueries({ queryKey: adminMembersQueryKey })
    },
  })

  const passwordMutation = useMutation({
    mutationFn: ({ id, password }: any) => resetMemberPassword(id, password),
  })

  return {
    members: membersQuery.data ?? [],
    loading: membersQuery.isPending,
    error: membersQuery.error ? (membersQuery.error.message || '회원 목록을 불러오지 못했습니다.') : '',
    updateRole: roleMutation.mutateAsync,
    removeMember: deleteMutation.mutateAsync,
    resetPassword: passwordMutation.mutateAsync,
  }
}
