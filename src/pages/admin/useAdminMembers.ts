import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createMember,
  deleteMember,
  listMembers,
  listMembersPage,
  resetMemberPassword,
  updateMemberGeneration,
  updateMemberRole,
} from '../../services/adminApi'
import { queryKeys } from '../../services/queryKeys'

const adminMembersQueryKey = queryKeys.admin.members()

type CreateMemberPayload = {
  studentId: string
  name: string
  email: string
  password: string
  generation: string
  role: string
  department: string
  phone: string
}

export function useAdminMembers(pageOptions?: { page: number; size: number; search: string; role: string; status: string }) {
  const queryClient = useQueryClient()
  const membersQuery = useQuery({
    queryKey: pageOptions ? [...adminMembersQueryKey, 'page', pageOptions] : adminMembersQueryKey,
    queryFn: async () => {
      if (pageOptions) return listMembersPage(pageOptions.page, pageOptions.size, pageOptions.search, pageOptions.role, pageOptions.status)
      const data = await listMembers()
      return Array.isArray(data) ? data : []
    },
    select: (data) => Array.isArray(data) ? { members: data, total: data.length } : data,
    placeholderData: (previousData) => previousData,
  })

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string | number; role: string }) => updateMemberRole(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminMembersQueryKey })
    },
  })

  const createMutation = useMutation({
    mutationFn: (payload: CreateMemberPayload) => createMember(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminMembersQueryKey })
    },
  })

  const generationMutation = useMutation({
    mutationFn: ({ id, generation }: { id: string | number; generation: string }) => updateMemberGeneration(id, generation),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminMembersQueryKey })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteMember(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminMembersQueryKey })
    },
  })

  const passwordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string | number; password: string }) => resetMemberPassword(id, password),
  })

  return {
    members: membersQuery.data?.members ?? [],
    total: membersQuery.data?.total ?? 0,
    loading: membersQuery.isPending,
    fetching: membersQuery.isFetching,
    error: membersQuery.error ? (membersQuery.error.message || '회원 목록을 불러오지 못했습니다.') : '',
    refetch: membersQuery.refetch,
    addMember: createMutation.mutateAsync,
    updateRole: roleMutation.mutateAsync,
    updateGeneration: generationMutation.mutateAsync,
    removeMember: deleteMutation.mutateAsync,
    resetPassword: passwordMutation.mutateAsync,
  }
}
