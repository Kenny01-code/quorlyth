# Quorlyth — Assessment Brief & Acceptance Checklist

## Challenge

**Operating System for Fanbases — Intermediate**

Influencers and creators receive thousands of messages, ideas, collaboration requests, and opportunities. Valuable ideas and people are easy to miss. Build a platform that helps a creator organize their audience into meaningful communities, surface valuable ideas and opportunities, and collaborate with the audience.

## Product goal

Quorlyth should make the journey from audience participation to creator action clear and traceable:

**Followers → Interest-based communities → Ideas → Collaboration → AI-assisted surfacing → Creator selection → Promotion to the wider audience**

## MVP requirements

1. **Interest-based communities**
   - A creator can create and manage communities with a clear purpose.
   - Audience members can discover and join communities.
   - Community membership and posting rules should be respected.

2. **Idea submissions and collaboration**
   - Members can submit ideas to the appropriate community.
   - Ideas can be discussed and voted on.
   - Interested contributors can apply to collaborate.
   - The creator can review and accept or decline collaboration applications.

3. **AI-assisted surfacing**
   - AI helps filter, rank, or summarize submitted ideas and potential contributors.
   - Recommendations should be based on available app data and explain their rationale.
   - AI output must not invent votes, members, activity, or evidence. If the provider is unavailable, the app should show a useful failure state rather than fake a successful result.

4. **Creator review and decisions**
   - The creator has a queue for reviewing ideas.
   - The creator can select, hold, or decline an idea.
   - Decisions and statuses should remain visible and consistent.

5. **Project execution**
   - A selected idea can become a project.
   - The creator can add milestones and update their status.
   - Members should be able to understand what happened to ideas they contributed.

6. **Promotion**
   - Selected ideas can be prepared as an announcement or shareable post.
   - The interface must distinguish a prepared draft from an actually published external post.
   - A creator can identify contributors for credit.

## End-to-end acceptance scenario

Use two separate accounts where practical: one creator/owner and one audience member.

- [ ] Creator creates a community with a purpose and posting rules.
- [ ] Audience member joins that community.
- [ ] Audience member submits an idea.
- [ ] A second member can vote or comment on the idea.
- [ ] Audience member submits a collaboration application.
- [ ] Creator sees the idea and application in the appropriate review area.
- [ ] AI-assisted surfacing returns a summary/rationale based on real idea/activity data, or a clear provider error if unavailable.
- [ ] Creator accepts or declines the collaboration application.
- [ ] Creator selects the idea and creates a project with at least one milestone.
- [ ] Creator updates the milestone and sees the new status.
- [ ] Creator prepares a promotion draft and the UI does not claim an external post was published unless an actual publishing integration confirms it.
- [ ] The audience member can see the relevant idea/project outcome according to access rules.
- [ ] Refreshing the page preserves the expected state in the configured shared database.
- [ ] Unauthorized users cannot read or mutate creator-only data.
- [ ] Loading, empty, and error states are understandable.
- [ ] The core journey works on desktop and mobile layouts.

## Engineering and quality expectations

- TypeScript/React code with understandable component and data boundaries.
- Server-side AI requests; secret provider keys never shipped to the browser.
- Authentication and row-level access policies for shared data.
- Useful loading, empty, and error states.
- Keyboard-accessible controls and clear focus states.
- Responsive UI and consistent navigation.
- Tests for critical provider handlers and collaboration behavior.
- No fake metrics, fake success messages, or claims that an external action completed when it did not.

## Current implementation map

The repository contains screens for communities, idea details, review queue, promotion preparation, analytics, settings, profiles, access requests, messages, and projects. The review queue derives each idea's backers from the persisted vote map and links each backer's avatar/name to their public profile. Collaboration applications appear with the selected idea, including pending/accepted/declined state and owner-only decision controls. The Projects page exposes project creation, summary editing, milestone create/edit/status updates, project completion, and read-only progress for users who can access the underlying idea/project. Server-side AI endpoints and automated tests are located in server/ and api/.

These improvements are implementation and automated-test evidence, not proof that the full acceptance scenario has passed in a live browser with two production accounts.

## Verification status

- [x] Production Supabase migration history was inspected. The latest tracked security migration is 20261015070600_grant_manage_community_rls_exec; the matching SQL is included in this branch.
- [x] Added a regression test proving authenticated can execute the community-management helper required by join-request RLS while anon cannot.
- [x] Automated security tests cover the simulated creator/member idea → collaboration → project/milestone path and creator-only decision/update permissions.
- [x] Production RLS smoke checks with a synthetic unrelated authenticated UID returned no review rows and no platform-admin role; anonymous checks returned no review or settings rows. Listed communities and the explicitly public, read-only settings/space record remain discoverable by policy.
- [x] npm test passed: 23 tests, zero failures.
- [x] npm run typecheck passed.
- [x] npm run build passed; Vite still prints a non-blocking large-chunk-size warning.
- [x] A live production /api/json smoke test with ten synthetic ideas returned ten unique, structurally valid reviews; no application records were written.
- [x] A source scan found no hardcoded platform-owner email or provider API key configured in frontend code.
- [ ] Complete the end-to-end scenario with two separate real accounts against production Supabase.
- [ ] Exercise the signed-in production UI for supporter profile links, application accept/decline, project/milestone edits, message creation, and refresh persistence.
- [ ] Complete a production denial matrix for each sensitive record category and role; the existing automated suite is simulated, not a full live-role denial matrix.
- [ ] After merging this branch, confirm Vercel's production deployment SHA matches the resulting GitHub main SHA.

## Submission evidence to capture

1. Landing page and creator dashboard.
2. Community creation by the creator and successful join by the audience member.
3. Audience idea submission, second-member backing/comment, and collaboration application.
4. Review queue showing actual backer avatars/profile links, applicant details, real AI rationale, and accepted/declined state.
5. Project creation, milestone edit/status change, and the audience member's read-only view of progress after refresh.
6. Promotion draft showing the external post is prepared, not published.
7. npm test, npm run typecheck, npm run build output, and the exact production deployment commit SHA.
