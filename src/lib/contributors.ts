import { Community, Idea } from './types'

/** Match the backend owner rule: an explicit ownerId wins; createdBy is the legacy fallback. */
export function communityOwnerLookup(
  communities: readonly Pick<Community, 'id' | 'ownerId' | 'createdBy'>[],
): Map<string, string> {
  return new Map(communities.map(community => [
    community.id,
    community.ownerId || community.createdBy || '',
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
