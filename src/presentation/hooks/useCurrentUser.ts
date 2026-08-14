import { useUser } from '@clerk/react'
import { useMemo } from 'react'
import type { User } from '../../domain/user/entity'
import { toDomainUser } from '../../infra/auth/clerk-user'

export interface UseCurrentUserResult {
  /** `false` enquanto o Clerk carrega — não confie em `user` antes disso. */
  isLoaded: boolean
  isSignedIn: boolean
  user: User | null
}

/** Expõe o usuário autenticado do Clerk já como entidade de domínio. */
export function useCurrentUser(): UseCurrentUserResult {
  const { isLoaded, isSignedIn, user } = useUser()

  const domainUser = useMemo(() => (user ? toDomainUser(user) : null), [user])

  return {
    isLoaded,
    isSignedIn: isSignedIn ?? false,
    user: domainUser,
  }
}
