import type { useUser } from '@clerk/react'
import { User } from '../../domain/user/entity'

/**
 * O tipo do usuário do Clerk é derivado do próprio SDK em vez de importado de
 * `@clerk/types` (que não é dependência direta), assim ele nunca fica fora de
 * sincronia com a versão instalada de `@clerk/react`. É import de tipo: some no
 * build.
 */
export type ClerkUser = NonNullable<ReturnType<typeof useUser>['user']>

/**
 * Adapta o usuário do Clerk para a entidade de domínio, mantendo o SDK
 * confinado à camada de infra.
 */
export function toDomainUser(resource: ClerkUser): User {
  const email =
    resource.primaryEmailAddress?.emailAddress ?? resource.emailAddresses[0]?.emailAddress ?? ''

  return new User({
    id: resource.id,
    name: resource.fullName ?? resource.username ?? email,
    email,
    imageUrl: resource.hasImage ? resource.imageUrl : undefined,
    createdAt: resource.createdAt?.toISOString(),
  })
}
