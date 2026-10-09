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

The repository currently contains screens for communities, idea details, review queue, promotion preparation, analytics, settings, profiles, access requests, and a dashboard. Its shared data layer includes communities, ideas, votes, members, reviews, collaboration applications, projects, milestones, promotions, profiles, and settings. Server-side AI endpoints and tests are located in `server/` and `api/`.

The latest code change also adds collaboration-related data/actions and improves startup/read error handling and promotion status wording. These are implementation notes, not proof that the full acceptance scenario has passed in a live deployment.

## Verification status

- [x] Latest code commit is present on GitHub `main`.
- [x] Local build completed successfully in the recorded verification run.
- [x] Six AI-provider handler tests passed in the recorded verification run.
- [ ] Re-run build and tests against the current remote checkout.
- [ ] Complete the end-to-end scenario using separate creator/member accounts against production Supabase.
- [ ] Verify RLS for each table and role, including read and write denial cases.
- [ ] Verify production AI requests with the configured Vercel environment variables.
- [ ] Verify that the live Vercel deployment contains the latest GitHub commit.
- [ ] Configure or confirm Git-connected continuous deployment from `main`.

## Submission evidence to capture

1. Landing page and creator dashboard.
2. Community creation and member join flow.
3. Idea submission, vote/comment, and collaboration application.
4. Creator review queue and AI rationale.
5. Project/milestone progress.
6. Promotion draft showing honest publishing status.
7. A successful build/test run and the exact production deployment commit SHA.
