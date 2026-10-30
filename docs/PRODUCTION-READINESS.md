# Quorlyth production readiness audit

**Audit date:** 2026-10-30  
**Scope:** Read-only review of the connected production deployment, Supabase schema and aggregate application records, repository documentation, and public route responses.

This is an infrastructure and data-integrity snapshot. It is not a certification that every signed-in workflow works end to end.

## Executive summary

The production deployment and Supabase project are reachable and healthy at the infrastructure level. The current database records also pass the relationship-integrity checks listed below.

Quorlyth is **not yet cleared for an unrestricted public launch**. The most important remaining items are a two-account browser acceptance test, enabling Supabase leaked-password protection, and confirming that current account/activity records represent independent external creators and members rather than development or assessment testing.

## Verified checks

| Area | Result | Evidence |
|---|---|---|
| Vercel production deployment | PASS | Deployment `dpl_87xQB4At5n2LJv6Z69jLZ4Fp3ZR1` is `READY`, on main commit `8d5e9eaf64df54de943777d669f8cade39eaa80e`. |
| Public route reachability | PASS | GET requests to `/`, `/signin`, and `/architecture` returned HTTP 200 and the application shell. This does not exercise client-side interactions. |
| Supabase project | PASS | Connected `QUORLYTH` project reports `ACTIVE_HEALTHY`, region `eu-central-1`. |
| Production backend configuration | PASS | Vercel production environment contains `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; the project is not falling back to local browser-only auth because those two production variables are absent. |
| Sensitive provider configuration | PASS | AI provider credentials inspected by metadata only are stored as sensitive Vercel variables. Secret values were not retrieved or copied into this report. |
| `public.docs` row-level security | PASS | RLS is enabled and scoped read/insert/update/delete policies exist. |
| Latest runtime error aggregation | PASS, limited | Vercel returned no grouped runtime error clusters for the last 24 hours. The separate 24-hour raw log query was outside the current Hobby log-retention window, so this is not a full 24-hour log review. |
| Main data relationships | PASS | The orphan checks below returned zero for all tested relationship categories. |

## Aggregate production data snapshot

These are database record counts, not customer or revenue claims.

| Record | Count |
|---|---:|
| Confirmed Supabase Auth accounts | 8 |
| Accounts with a sign-in in the previous 7 days | 6 |
| Community records | 9 |
| Idea records | 35 |
| Project records | 9 |
| Conversation records | 19 |
| Message records | 43 |
| AI review records | 13 |
| Idea outcome records | 13 |
| Collaboration applications | 5 |
| Community join requests | 4 |
| Milestone records | 1 |

Distinct identity counts in stored records: 3 community owners, 4 idea authors, 2 project creators, and 2 collaboration applicants. These identities show that activity is not confined to one record owner, but they have **not** been verified as independent external customers or pilot participants.

### Referential-integrity checks

The read-only production queries returned:

- Ideas without a matching community: **0**
- Projects without a matching idea: **0**
- Projects without a selected/promoted review: **0**
- Collaboration applications without a matching idea: **0**
- Promotions without a matching idea: **0**
- Milestones without a matching project: **0**

These checks cover the listed relationships only; they do not replace role-based authorization tests.

## Security and operational findings

### Action required before broad public signup

Supabase Security Advisor reports that **leaked-password protection is disabled**. Enable the leaked-password check in the Supabase Authentication password/security settings, then test password signup and reset flows. This setting was not changed during this audit because the connected Supabase management tools do not expose the Auth password-security setting.

### Informational findings, not confirmed vulnerabilities

- Security Advisor reports that `private.platform_roles` and `private.write_rate_limits` have RLS enabled without policies. The bootstrap/hardening SQL revokes table privileges from `public`, `anon`, `authenticated`, and `service_role`; these tables are designed to be inaccessible directly and used through narrowly scoped privileged functions. Do not add broad policies just to silence the informational lint.
- Performance Advisor lists five unused indexes. With the current small data volume, do not drop them solely based on this snapshot. Revisit after representative production traffic exists.
- Raw Vercel logs for a full 24-hour period were unavailable under the current log-retention allowance. The error-cluster query did complete and returned no clusters.

### Private attachment storage

Both production attachment buckets exist and are configured as **private**:

- `quorlyth-chat-attachments`
- `quorlyth-work-submissions`

Each bucket has a 25 MiB file-size limit, matching the current upload guards in the backend. The Storage `objects` table has seven authenticated policies covering chat media upload/read/delete and work-submission upload/read/delete (including project-manager cleanup). The policies use `WITH CHECK` for inserts and `USING` for reads/deletes.

This verifies bucket configuration and policy presence, not a full cross-user attempt to read another member's signed file URL. That authorization test remains part of the two-account acceptance matrix.

## Manual two-account acceptance test - still pending

No authenticated browser session was available during this audit. Do not mark the following as passed until two distinct accounts have completed the scenarios in the deployed application.

| Scenario | Creator account | Member account | Status |
|---|---|---|---|
| Sign up, confirm email, sign in, sign out, and sign back in | Verify owner/creator role | Verify normal member role | NOT TESTED |
| Create a community and set posting/join rules | Create and edit | Discover and join/request access | NOT TESTED |
| Submit, vote on, and comment on an idea | Observe real-time updates | Submit and engage | NOT TESTED |
| Run AI review and inspect rationale/evidence | Run review and make a decision | Confirm only allowed outcomes are visible | NOT TESTED |
| Apply to collaborate and decide | Accept/decline | Apply and observe decision | NOT TESTED |
| Create a project and milestones | Create, assign, update | View permitted progress and submit work | NOT TESTED |
| Messaging and attachments | Send and receive | Send and receive | NOT TESTED |
| Cross-account authorization | Confirm creator-only controls | Attempt access to another community's private records | NOT TESTED |
| Persistence | Refresh and revisit after sign-out | Refresh and revisit after sign-out | NOT TESTED |
| Mobile layout and accessibility | Exercise key screens | Exercise key screens | NOT TESTED |

### Safe test procedure

1. Use two distinct email accounts controlled by the tester. Do not share passwords in chat or commit them to the repository.
2. Prefer a dedicated pilot community and clearly labelled test ideas. Do not use existing creators' or members' private content as test fixtures.
3. Complete each scenario once on desktop and repeat the critical flows on a phone viewport/device.
4. Record the affected route, account role, exact action, expected result, actual result, and screenshot/console evidence for every failure.
5. Delete only test data that is confirmed to have been created for this audit. Do not delete real member records or existing product data.

## Recommended execution order

1. Enable leaked-password protection in Supabase Auth and verify signup/reset behavior.
2. Complete the two-account acceptance matrix above. Fix any failures before adding features.
3. Add first-party product analytics for activation, meaningful weekly activity, creator retention, and paid conversion. Keep those metrics distinct from community-level Analytics.
4. Run a small founding-creator pilot and verify that participants are real independent creators with active audiences.
5. Test pricing and paid demand only after creators complete the core idea-to-collaboration journey.

## Commercial interpretation

This audit does not establish MRR, paid conversion, retention, customer acquisition cost, or a sale valuation. Buildside's $3,675 month-12 MRR and $132.3K sale estimate remain scenario outputs, not current business performance.
