import { Community, Idea } from './types'

/** Resolve the creator responsible for each community, including legacy platform-owned spaces. */
export function communityOwnerLookup(
  communities: readonly Pick<Community, 'id' | 'ownerId' | 'createdBy'>[],
  fallbackOwnerId?: string | null,
): Map<string, string> {
  return new Map(communities.map(community => [
    community.id,
    community.ownerId || community.createdBy || fallbackOwnerId || '',
  ]))
}

/** Community owners are not ranked as contributors for ideas they author in their own community. */
export function isCommunityOwnerContribution(
  idea: Pick<Idea, 'cid' | 'authorId'>,
  owners: ReadonlyMap<string, string>,
): boolean {
  const ownerId = owners.get(idea.cid)
  return !!ownerId && idea.authorId === ownerId
}
