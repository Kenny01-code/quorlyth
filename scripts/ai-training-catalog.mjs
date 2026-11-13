export const DATASET_VERSION = "1.0.0";

export const NICHES = [
  {
    "id": "music",
    "label": "music",
    "audience": "independent music listeners"
  },
  {
    "id": "gaming",
    "label": "gaming",
    "audience": "players and live-stream viewers"
  },
  {
    "id": "education",
    "label": "educational",
    "audience": "learners with different experience levels"
  },
  {
    "id": "beauty",
    "label": "beauty",
    "audience": "people sharing beauty routines and product questions"
  },
  {
    "id": "fitness",
    "label": "fitness",
    "audience": "people working toward realistic fitness goals"
  },
  {
    "id": "storytelling",
    "label": "storytelling",
    "audience": "readers and fans of serialized stories"
  },
  {
    "id": "fashion",
    "label": "fashion",
    "audience": "people interested in personal style"
  },
  {
    "id": "technology",
    "label": "technology",
    "audience": "people learning about useful technology"
  },
  {
    "id": "food",
    "label": "food",
    "audience": "home cooks and food enthusiasts"
  },
  {
    "id": "local_community",
    "label": "local community",
    "audience": "people interested in local events and shared projects"
  }
];

export const SITUATIONS = [
  {
    "id": "low_budget",
    "text": "I have a very small budget and need to validate before spending.",
    "constraint": "keep the first test free or very low-cost"
  },
  {
    "id": "solo_builder",
    "text": "I work alone and have only a few focused hours each week.",
    "constraint": "keep the workload realistic for one person"
  },
  {
    "id": "launch_soon",
    "text": "I hope to launch a small version within two weeks.",
    "constraint": "prioritize a small, testable result within two weeks"
  },
  {
    "id": "quiet_audience",
    "text": "My audience is quiet, so I need a low-pressure way to invite participation.",
    "constraint": "make participation optional and free of guilt or pressure"
  },
  {
    "id": "privacy_sensitive",
    "text": "I want useful participation without collecting unnecessary personal information.",
    "constraint": "collect only data that is necessary and explain why"
  },
  {
    "id": "volunteer_led",
    "text": "Volunteers have uneven availability and different experience levels.",
    "constraint": "make ownership, deadlines, and handoffs explicit"
  },
  {
    "id": "rapid_growth",
    "text": "Interest is growing quickly and the process must still work at larger scale.",
    "constraint": "design for growth without needless complexity"
  },
  {
    "id": "early_stage",
    "text": "This is an early experiment with little reliable historical data.",
    "constraint": "separate assumptions from evidence and establish a small baseline"
  },
  {
    "id": "cross_platform",
    "text": "People participate across several channels and information gets scattered.",
    "constraint": "create one source of truth and define how information moves"
  },
  {
    "id": "accessibility",
    "text": "People have different devices, abilities, language preferences, and time zones.",
    "constraint": "make the experience accessible, clear, and flexible"
  }
];

export const DOMAINS = [
  {
    "id": "idea_design",
    "label": "idea design and validation",
    "tasks": [
      {
        "id": "clarify_idea",
        "ask": "turn a rough idea into a clear concept",
        "guidance": "Write a one-sentence concept, name the specific audience problem, describe the proposed outcome, and list the biggest assumption. For {audience}, validate the problem before building. Since I should {constraint}, finish with one small test and a measurable signal; do not present assumed demand as proven."
      },
      {
        "id": "improve_title",
        "ask": "write a specific and memorable title for the idea",
        "guidance": "Use a short title that names the intended outcome rather than making a vague promise. Prepare three alternatives, compare them for clarity and specificity, and choose one {audience} can understand quickly. Keep claims modest and ensure the title matches what can actually be delivered."
      },
      {
        "id": "define_problem",
        "ask": "frame the user problem and why it matters",
        "guidance": "Describe who experiences the problem, when it happens, the cost of the current workaround, and evidence supporting the claim. For {audience}, observe or interview a small representative group before generalizing. Respect the need to {constraint}; distinguish observed facts from hypotheses."
      },
      {
        "id": "mvp_scope",
        "ask": "define the smallest useful first version",
        "guidance": "Keep only the capability needed to test the core value. Write an in-scope list, an out-of-scope list, and a completion criterion. Choose a test demonstrating the main benefit without supporting every edge case. Respect the need to {constraint} and avoid premature scaling."
      },
      {
        "id": "differentiate",
        "ask": "explain how the idea can be meaningfully different",
        "guidance": "Compare the proposed experience with current workarounds and alternatives using verifiable differences such as speed, trust, accessibility, or coordination. Do not claim uniqueness without research. Ask {audience} which trade-off matters most and narrow the differentiator to something deliverable."
      },
      {
        "id": "test_hypothesis",
        "ask": "design a low-risk experiment to test the main assumption",
        "guidance": "State the hypothesis, audience, smallest experiment, duration, and success threshold before running it. Choose a behavior signal rather than relying only on compliments. Because I should {constraint}, avoid overbuilding; record inconclusive outcomes honestly and decide in advance what result would change the plan."
      },
      {
        "id": "prioritize",
        "ask": "prioritize several possible features or improvements",
        "guidance": "Rank options by user value, evidence strength, effort, risk, and reversibility. Prioritize a small change that tests the riskiest assumption, not simply the most exciting feature. Explain the trade-offs for {audience} and defer low-evidence work until a useful signal arrives."
      },
      {
        "id": "synthesize_feedback",
        "ask": "turn mixed feedback into a useful decision",
        "guidance": "Group feedback into recurring needs, one-off preferences, reported blockers, and unanswered questions. Preserve context and do not treat the loudest comment as representative. Choose one next action based on impact and evidence, then define what could support or overturn the decision."
      },
      {
        "id": "write_pitch",
        "ask": "write a concise pitch that explains the value",
        "guidance": "Use four parts: audience, problem, proposed change, and concrete next step. Keep the pitch specific and avoid claims about popularity, guaranteed outcomes, or uncompleted work. End with one low-friction action that helps {audience} evaluate the idea."
      },
      {
        "id": "assess_risk",
        "ask": "identify the biggest risks and how to reduce them",
        "guidance": "List user, delivery, privacy, and adoption risks; estimate likelihood and impact qualitatively; and propose practical mitigations for high-impact risks. Test reversible assumptions first. Make uncertainty visible and set a trigger for pausing, changing scope, or requesting expert review."
      }
    ]
  },
  {
    "id": "community_design",
    "label": "community design and participation",
    "tasks": [
      {
        "id": "purpose",
        "ask": "define a focused community purpose",
        "guidance": "Write who the community serves, what members come together to do, and which outcomes are in scope. Keep the purpose narrow enough to guide posting and moderation. Ask a few {audience} members what they expect here and revise using actual feedback."
      },
      {
        "id": "welcome",
        "ask": "draft a warm and useful welcome message",
        "guidance": "Welcome people in plain language, explain the purpose, give one simple first action, and point to rules and help. Do not assume new members know the platform. Keep participation voluntary and make it easy to ask questions or leave without pressure."
      },
      {
        "id": "rules",
        "ask": "write short and enforceable community guidelines",
        "guidance": "Describe observable behaviors: respect others, stay relevant, protect private information, disclose conflicts, and report problems through a defined route. Explain moderation actions and appeals. Avoid vague rules that enable arbitrary enforcement; apply the same standard consistently."
      },
      {
        "id": "posting_policy",
        "ask": "choose a fair policy for who can post",
        "guidance": "Choose open posting when discoverability matters, member-only posting when membership provides context, or owner/moderator posting when control is essential. Explain the trade-off and provide a clear way to join or request access. Do not portray restrictions as a judgment of people."
      },
      {
        "id": "onboarding",
        "ask": "design onboarding that helps new members participate",
        "guidance": "Show purpose, rules, privacy expectations, and one low-effort first action in a short sequence. Offer examples of useful posts and explain replies. Measure successful first participation without forcing introductions or collecting sensitive details that are not needed."
      },
      {
        "id": "engagement",
        "ask": "create a sustainable member engagement plan",
        "guidance": "Use a predictable rhythm of useful prompts, member-led contributions, and transparent follow-up. Prefer specific questions over generic engagement requests. Given the need to {constraint}, optimize for meaningful participation and member value rather than raw post counts."
      },
      {
        "id": "event",
        "ask": "plan a small community event",
        "guidance": "Define one purpose, an accessible time window, a clear host, a simple agenda, participation options, and a follow-up summary. Confirm time zones and accessibility needs. Afterward, share decisions and owners while avoiding unnecessary publication of personal details."
      },
      {
        "id": "moderator_workflow",
        "ask": "create a consistent moderator workflow",
        "guidance": "Define how reports are received, triaged by severity, assigned, investigated, documented, and closed. Separate urgent safety issues from ordinary disagreement and limit sensitive case details to authorized moderators. Record decisions and appeals for consistent treatment."
      },
      {
        "id": "member_feedback",
        "ask": "collect member feedback without pressuring people",
        "guidance": "Ask a few specific, optional questions about value, friction, and desired changes. State whether responses are anonymous, how they will be used, and when results will be shared. Let people skip the survey and avoid collecting unnecessary information."
      },
      {
        "id": "health_metrics",
        "ask": "measure community health without vanity metrics",
        "guidance": "Combine meaningful contributions, repeat participation, response quality, member-reported value, unresolved reports, and time-to-help. Define each metric and its observation window. Treat member counts as context, not proof of value, and interpret small samples cautiously."
      }
    ]
  },
  {
    "id": "project_delivery",
    "label": "project planning and delivery",
    "tasks": [
      {
        "id": "milestones",
        "ask": "break the goal into clear delivery milestones",
        "guidance": "Sequence scope clarification, a test of the riskiest assumption, the smallest useful version, user validation, and the next decision. Give each milestone an owner, due date, dependency, and deliverable. Since I should {constraint}, limit parallel work and define what can be deferred."
      },
      {
        "id": "acceptance",
        "ask": "write testable acceptance criteria",
        "guidance": "Write criteria that another person can check as pass or fail. Cover the normal path, important edge cases, permissions, errors, and accessibility where relevant. Avoid 'works well'; specify the observable result and evidence required before declaring completion."
      },
      {
        "id": "scope",
        "ask": "reduce scope while protecting the main user value",
        "guidance": "Separate must-have outcomes from polish, list dependencies, and remove work that does not test the main goal. Protect safety, data integrity, and user trust. Explain the impact of each deferral and retain a visible list of intentionally excluded work."
      },
      {
        "id": "timeline",
        "ask": "create a realistic short delivery timeline",
        "guidance": "Estimate tasks in small units, include review and testing time, identify dependencies, and reserve capacity for unknowns. Plan around actual availability. Schedule a demonstrable checkpoint early for {audience} and use remaining time to address the highest-risk gap."
      },
      {
        "id": "risk_register",
        "ask": "build a practical project risk register",
        "guidance": "For each risk, record cause, likelihood, impact, owner, mitigation, and trigger. Prioritize risks that could harm users, lose data, block delivery, or invalidate the core assumption. Review risks at each milestone and close them only with supporting evidence."
      },
      {
        "id": "dependencies",
        "ask": "map dependencies and handoffs",
        "guidance": "Represent tasks as deliverables with explicit inputs and outputs. Name each handoff owner, required format, and what happens if a dependency is late. Avoid circular ownership; schedule high-risk dependencies early and surface blockers before they threaten the deadline."
      },
      {
        "id": "blocker",
        "ask": "turn a blocker into a clear recovery plan",
        "guidance": "State impact, what is known, what has been tried, and the decision needed. Separate root cause from symptoms, assign one owner to the next investigation, and set a check-in. If the blocker is external, document a safe workaround and its limitations."
      },
      {
        "id": "review",
        "ask": "run a useful milestone review",
        "guidance": "Compare promised deliverables with evidence, review acceptance criteria, note deviations, and capture risks. Ask owners what support they need rather than making the review a blame exercise. End with a clear decision: complete, revise, hold, or split the work."
      },
      {
        "id": "launch_checklist",
        "ask": "prepare a reliable launch checklist",
        "guidance": "Check the happy path, failure states, permissions, recovery, monitoring, documentation, support ownership, and rollback plan. Require evidence for launch criteria. Separate nonessential polish from launch blockers and name the person authorized to pause rollout."
      },
      {
        "id": "retrospective",
        "ask": "run a blameless project retrospective",
        "guidance": "Review expectations, actual outcomes, evidence explaining gaps, and practices that helped or hurt. Choose a few actions with owners and deadlines. Avoid vague commitments; define how the team will verify that a change improved the next cycle."
      }
    ]
  },
  {
    "id": "collaboration",
    "label": "collaboration and contributor management",
    "tasks": [
      {
        "id": "role_scope",
        "ask": "define a contributor role clearly",
        "guidance": "Describe outcome, tasks, required skills, expected time, decision authority, support, and definition of done. Separate essential skills from learnable ones. Keep the role compatible with the constraint and never promise payment, credit, or opportunity unless confirmed."
      },
      {
        "id": "application",
        "ask": "design a respectful contributor application",
        "guidance": "Ask only for task-relevant information: interest, examples, availability, and support needed. Explain who reviews submissions, how decisions are made, data retention, and how to withdraw. Offer alternatives for people with skills but no formal credentials."
      },
      {
        "id": "match",
        "ask": "match volunteers to work fairly",
        "guidance": "Compare skills, interest, availability, task requirements, and support needs against a transparent rubric. Do not infer competence from popularity or identity. When evidence is limited, offer a small trial task with clear expectations rather than an unsupported ranking."
      },
      {
        "id": "task_breakdown",
        "ask": "turn a broad contribution into manageable tasks",
        "guidance": "Split work into independently reviewable tasks with one owner, explicit inputs, a deadline, and acceptance criteria. Identify parallel tasks and dependencies. Include a handoff note so another person can continue if availability changes."
      },
      {
        "id": "feedback",
        "ask": "give constructive contributor feedback",
        "guidance": "Point to a specific artifact or behavior, explain its effect, and propose an actionable improvement. Separate the work from the person's worth and invite their context. Agree on one next step and how success will be reviewed; avoid public criticism of private issues."
      },
      {
        "id": "selection",
        "ask": "make a transparent selection decision",
        "guidance": "Use a predeclared rubric based on task evidence, role fit, availability, and relevant constraints. Record concise reasons and disclose conflicts of interest. If candidates appear similarly qualified, consider a small trial or rotation rather than pretending the evidence is decisive."
      },
      {
        "id": "credit",
        "ask": "design a fair way to credit contributors",
        "guidance": "Ask contributors how they want to be credited, verify their actual contribution, and agree on wording before publication. Do not attribute uncompleted work or imply endorsement. Keep permission records and update credits if scope changes."
      },
      {
        "id": "handoff",
        "ask": "create a reliable handoff for shared work",
        "guidance": "Include current status, completed work, open questions, files, decisions, risks, and next action. Confirm access rights before sharing. Have the receiving person acknowledge ownership so responsibility does not disappear between contributors."
      },
      {
        "id": "conflict",
        "ask": "resolve a collaboration disagreement constructively",
        "guidance": "Restate each concern fairly, separate facts from interpretations, and return to the shared goal and agreed criteria. Move to a private channel when appropriate and pause unsafe behavior immediately. Record the decision without exposing unnecessary private details."
      },
      {
        "id": "availability",
        "ask": "coordinate changing volunteer availability",
        "guidance": "Make capacity explicit, keep tasks small enough to pause, and maintain handoff notes. Use reminders sparingly and never equate a delayed reply with lack of commitment. Reassign urgent work by agreement and recognize work already completed."
      }
    ]
  },
  {
    "id": "analytics",
    "label": "analytics and evidence-based decisions",
    "tasks": [
      {
        "id": "metric_tree",
        "ask": "define a metric tree for this goal",
        "guidance": "Start with the outcome, then identify leading behaviors and guardrails that plausibly influence it. Define each metric's numerator, denominator, time window, source, owner, and exclusions. Verify that it reflects value for {audience}, not only convenience of collection."
      },
      {
        "id": "event_schema",
        "ask": "design a minimal event tracking schema",
        "guidance": "Track only events needed for a stated decision. Define event names, properties, actor and timestamp semantics, deduplication, consent, retention, and access. Exclude secrets and unnecessary sensitive data; document schema changes so reports remain interpretable."
      },
      {
        "id": "dashboard",
        "ask": "design a dashboard that supports decisions",
        "guidance": "Put the decision question first, then a small set of defined metrics, trend context, and a useful drill-down. Show missingness, time range, and sample size. Label estimates and avoid decorative charts or aggregate scores that hide opposing patterns."
      },
      {
        "id": "trend",
        "ask": "interpret a change in a metric carefully",
        "guidance": "Describe direction, magnitude, time window, baseline, and segments before suggesting a cause. Check tracking changes, seasonality, sample size, and alternatives. Treat causality as a hypothesis unless the design supports it and name the next analysis needed."
      },
      {
        "id": "funnel",
        "ask": "analyze where people drop out of a funnel",
        "guidance": "Define a consistent cohort and time window, calculate stage conversion with explicit denominators, and inspect the largest meaningful drop. Segment only when sample sizes support interpretation. Validate event collection before recommending a product change."
      },
      {
        "id": "cohort",
        "ask": "measure retention by cohort",
        "guidance": "Group users by a defined start event and compare consistent follow-up windows. Specify whether retention means any return or a meaningful action. Account for acquisition mix and product changes instead of declaring a cause from a chart alone."
      },
      {
        "id": "experiment",
        "ask": "design an interpretable A/B experiment",
        "guidance": "Predefine hypothesis, primary metric, guardrails, assignment unit, eligibility, minimum detectable effect, duration, and decision rule. Avoid stopping based on repeated peeking and check sample-ratio mismatch. If volume is low, use qualitative learning and state uncertainty."
      },
      {
        "id": "attribution",
        "ask": "reason about which action contributed to an outcome",
        "guidance": "State the attribution model and what it can establish. Check timing, selection effects, cross-channel overlap, and missing observations. Prefer controlled or stronger comparison designs where feasible; correlation and last-click are not proof of incremental impact."
      },
      {
        "id": "data_quality",
        "ask": "audit data quality before analysis",
        "guidance": "Check completeness, uniqueness, valid ranges, schema changes, time zones, duplicates, and unexpected shifts. Compare sample source records with transformed data. Document exclusions and quarantine suspicious records rather than silently filling gaps."
      },
      {
        "id": "report",
        "ask": "write a concise evidence-based analytics report",
        "guidance": "Separate question, method, result, uncertainty, interpretation, and recommended action. Include observation window and sample size; distinguish facts from hypotheses. State what the data cannot answer and identify the next measurement that would reduce uncertainty."
      }
    ]
  },
  {
    "id": "automation",
    "label": "automation and workflow reliability",
    "tasks": [
      {
        "id": "trigger_action",
        "ask": "design an automation trigger and action sequence",
        "guidance": "Specify the triggering event, validate input, check permissions, execute the smallest safe action, and record the result. Define success and failure paths. Keep the trigger narrow enough to avoid accidental runs and show the outcome clearly."
      },
      {
        "id": "idempotency",
        "ask": "make a workflow safe against duplicate triggers",
        "guidance": "Assign a stable idempotency key to each logical operation and persist its state before retrying side effects. Return the existing result when work already completed. Test repeated, concurrent, delayed, and out-of-order events; do not rely only on a disabled UI button."
      },
      {
        "id": "recovery",
        "ask": "design failure handling and recovery",
        "guidance": "Classify validation, authorization, transient provider, and permanent errors separately. Retry only transient failures with bounded backoff; preserve inputs and audit history. Show honest status and a safe retry action, and do not report success until the side effect is confirmed."
      },
      {
        "id": "approval",
        "ask": "add human approval to a high-impact automation",
        "guidance": "Pause before irreversible or externally visible actions, show the exact proposed change, and require an authorized approver. Revalidate permissions and target state at execution time. Record approval and outcome; allow cancellation until execution begins."
      },
      {
        "id": "permissions",
        "ask": "define least-privilege automation permissions",
        "guidance": "List exact resources and actions required, then grant only those permissions. Separate read and write access, validate identity and authorization server-side, and never trust browser role claims. Log outcomes without storing secrets."
      },
      {
        "id": "scheduling",
        "ask": "choose a safe schedule for recurring jobs",
        "guidance": "Define timezone, recurrence, eligible records, overlap behavior, and missed-run policy. Use a durable checkpoint, prevent concurrent duplicates, and make jobs safe to rerun. Show last run, next run, and failure state so operators know whether work happened."
      },
      {
        "id": "observability",
        "ask": "make an automation easy to monitor",
        "guidance": "Track run ID, trigger, duration, current step, final status, retry count, and sanitized error code. Correlate side effects to one run and alert on user-impacting failures. Avoid logging prompts, tokens, private content, or unnecessary identifiers."
      },
      {
        "id": "testing",
        "ask": "test an automation before enabling it in production",
        "guidance": "Test normal flow, invalid inputs, missing permissions, duplicates, provider timeout, partial failure, retry, and cancellation. Use dry-run mode when possible. Assert unauthorized actions never execute and define rollback or remediation before rollout."
      },
      {
        "id": "rate_limits",
        "ask": "handle provider quotas and rate limits gracefully",
        "guidance": "Detect provider-specific quota and auth errors, respect retry guidance, and use bounded backoff with jitter for transient limits. Fail over only to a configured and authorized provider. Surface honest status and never promise unlimited service when quota is exhausted."
      },
      {
        "id": "workflow_documentation",
        "ask": "document the automation for future maintainers",
        "guidance": "Document owner, purpose, trigger, inputs, permissions, steps, dependencies, retry policy, failure states, and recovery. Include synthetic example payloads and a test checklist. Explain how to disable the workflow safely and review changes."
      }
    ]
  },
  {
    "id": "moderation",
    "label": "moderation, privacy, and safety",
    "tasks": [
      {
        "id": "report_triage",
        "ask": "triage a community report fairly",
        "guidance": "Classify urgency based on reported behavior and potential harm, preserve relevant evidence, and limit access to authorized reviewers. Distinguish a report from a proven violation. Apply published policy consistently, document the reason, and give a clear next step."
      },
      {
        "id": "privacy",
        "ask": "improve privacy without losing necessary functionality",
        "guidance": "Map each data field to a purpose, limit collection and retention, restrict role access, and explain practices clearly. Remove secrets from logs and prompts. If the feature works without a field, do not collect it just in case."
      },
      {
        "id": "appeal",
        "ask": "design a fair moderation appeal process",
        "guidance": "Tell the member which rule and action are involved, how to appeal, what information is needed, and when a response is expected. Where practical, use an independent reviewer. Limit evidence access and explain the final decision without exposing other members."
      },
      {
        "id": "spam",
        "ask": "reduce spam without blocking legitimate newcomers",
        "guidance": "Combine rate limits, duplicate detection, relevant account signals, and human review for ambiguous cases. Do not rely on one noisy signal. Make restrictions proportional, explain recovery, and monitor false positives alongside abuse reduction."
      },
      {
        "id": "harassment",
        "ask": "respond to harassment while protecting affected members",
        "guidance": "Prioritize safety and limit further exposure. Preserve relevant evidence securely, apply established rules, and offer a private support route. Do not force mediation in unsafe situations or publish personal details as proof."
      },
      {
        "id": "accessibility",
        "ask": "make community rules and safety tools accessible",
        "guidance": "Use plain language, keyboard-accessible controls, clear labels, and alternatives to time-sensitive participation. Enable private reporting without public confrontation and avoid unnecessary disclosure. Test across devices and assistive technologies where possible."
      },
      {
        "id": "conflict",
        "ask": "separate ordinary disagreement from policy violations",
        "guidance": "Evaluate observable behavior against written rules, not popularity or viewpoint. Allow respectful disagreement while addressing threats, targeted harassment, and repeated disruption. Explain the boundary and use proportionate action consistently."
      },
      {
        "id": "transparency",
        "ask": "explain a moderation decision transparently",
        "guidance": "State the relevant rule, observed behavior at a safe level, action taken, and appeal route. Share only what the recipient is entitled to know. Avoid public shaming and do not imply an allegation is established before review."
      },
      {
        "id": "incident",
        "ask": "create a plan for a serious community incident",
        "guidance": "Assign an incident lead, contain immediate harm, preserve essential evidence, notify appropriate people, and document decisions with timestamps. Define escalation and recovery criteria. After resolution, review root causes and safely communicate lessons."
      },
      {
        "id": "roles",
        "ask": "define moderation roles and permissions",
        "guidance": "Give each role a clear purpose and minimum required permissions. Separate routine moderation from platform administration and irreversible data changes. Review access periodically, log sensitive actions, and provide escalation for conflicts of interest."
      }
    ]
  },
  {
    "id": "product_ux",
    "label": "product UX and software delivery",
    "tasks": [
      {
        "id": "validation",
        "ask": "improve form validation and error handling",
        "guidance": "Validate fields at boundaries, identify the exact field and correction, preserve valid input, and make errors accessible. Do not show raw stack traces or claim a save succeeded before confirmation. Test malformed, empty, oversized, and duplicate inputs."
      },
      {
        "id": "empty_state",
        "ask": "design a useful empty state",
        "guidance": "Explain why the view is empty, what the user can do next, and which prerequisites or permissions apply. Use one clear primary action and a short example. Do not imply the system is broken or force an invitation step when the user can explore first."
      },
      {
        "id": "loading",
        "ask": "make loading states feel reliable",
        "guidance": "Show useful progress, prevent accidental duplicate submissions, and support cancellation or safe retries. Set an honest timeout and distinguish pending from completed. Avoid indefinite spinners and do not erase user input when a request fails."
      },
      {
        "id": "navigation",
        "ask": "simplify navigation across related workflows",
        "guidance": "Group destinations by user goal, use familiar labels, and preserve context between list, detail, and edit views. Make location and back navigation clear. Validate the structure with representative tasks before changing the entire interface."
      },
      {
        "id": "accessibility",
        "ask": "audit accessibility for this feature",
        "guidance": "Check semantic headings, form labels, focus order, visible focus, keyboard operation, contrast, reduced motion, error announcements, and target size. Test without a mouse and use native controls where suitable. Treat accessibility as a release requirement."
      },
      {
        "id": "onboarding",
        "ask": "improve first-time onboarding",
        "guidance": "Ask only for information needed to reach a first useful outcome. Explain each step, allow safe deferral, and show progress. Measure completion of the meaningful first action and collect friction feedback instead of celebrating account creation alone."
      },
      {
        "id": "performance",
        "ask": "investigate a slow or unresponsive page",
        "guidance": "Reproduce the slow path, measure network, JavaScript, database, and rendering time separately, and establish a baseline. Optimize the highest-impact bottleneck, add a regression check, and do not claim improvement without a repeatable measurement."
      },
      {
        "id": "release",
        "ask": "prepare a safe release plan",
        "guidance": "List user-visible changes, migrations, environment needs, smoke tests, monitoring, rollback criteria, and owners. Separate build success from production health. Roll out gradually when possible and verify critical user flows after release."
      },
      {
        "id": "user_research",
        "ask": "plan a lightweight usability test",
        "guidance": "Choose a representative task, recruit relevant participants, and ask them to think aloud without coaching. Record completion, confusion, and workarounds with consent. Treat a small study as diagnostic rather than statistically representative and prioritize repeated high-impact issues."
      },
      {
        "id": "error_copy",
        "ask": "rewrite an error message so users know what to do",
        "guidance": "Name what failed in plain language, state whether work was saved, and give one safe next action. Avoid blame, internal codes, and false certainty. If the cause is unknown, say so and provide a way to retry or get support."
      }
    ]
  },
  {
    "id": "ml_data_science",
    "label": "machine learning and data science",
    "tasks": [
      {
        "id": "problem_framing",
        "ask": "frame this as a measurable data science problem",
        "guidance": "Define the decision supported, unit of prediction or retrieval, target, information available at prediction time, and cost of errors. Establish a simple baseline. Do not use ML when a transparent rule or workflow would solve the problem more safely."
      },
      {
        "id": "dataset_design",
        "ask": "design a useful training dataset",
        "guidance": "Specify schema, target behavior, label definitions, permitted sources, provenance, and review status before collecting records. Use representative examples rather than duplicates and mark synthetic data clearly. Separate training, validation, and held-out evaluation data to avoid measuring memorization."
      },
      {
        "id": "data_leakage",
        "ask": "check for data leakage in an evaluation",
        "guidance": "Trace each feature to when it becomes available; check target-derived columns and duplicate entities across splits. Split by time or entity when deployment requires it and fit preprocessing only on training data. Remove leakage and rerun the evaluation."
      },
      {
        "id": "metrics",
        "ask": "choose appropriate metrics for the model",
        "guidance": "Choose metrics based on real error costs and operating thresholds. For ranking, inspect relevance at top-k and coverage; for classification, consider precision, recall, calibration, and class prevalence. Report uncertainty where feasible and compare against a baseline."
      },
      {
        "id": "imbalance",
        "ask": "evaluate a model with imbalanced classes",
        "guidance": "Report class prevalence, per-class precision and recall, and the confusion matrix. Choose thresholds based on false-positive and false-negative costs. Use suitable splits and do not rely on accuracy alone or rebalance held-out test data to improve appearances."
      },
      {
        "id": "rag",
        "ask": "improve a retrieval-augmented generation system",
        "guidance": "Measure retrieval relevance separately from answer quality. Evaluate chunk size, metadata filters, lexical and semantic retrieval, and reranking on fixed representative queries. Keep provenance and access rules attached to each chunk; prefer abstention over unsupported claims."
      },
      {
        "id": "evaluation_set",
        "ask": "build an evaluation set for an AI assistant",
        "guidance": "Sample realistic tasks across intent, language, difficulty, ambiguity, and risk. Define a rubric before inspecting results and keep a held-out set out of prompt tuning. Score factual support, task completion, safety, and failure recovery; use failures to improve the next version."
      },
      {
        "id": "hallucination",
        "ask": "reduce unsupported AI claims",
        "guidance": "Supply relevant evidence, distinguish verified app state from examples, express uncertainty when evidence is missing, and evaluate claims against sources. Authorize tools server-side. Measure unsupported-claim rate on labeled cases rather than relying on confident language."
      },
      {
        "id": "privacy",
        "ask": "protect privacy in data and model workflows",
        "guidance": "Minimize collection, remove secrets and direct identifiers, define retention and access, and record provenance. Do not move private user data into shared training without a proper basis and consent. Apply controls to prompts, logs, exports, and backups."
      },
      {
        "id": "monitoring",
        "ask": "monitor model quality after release",
        "guidance": "Track latency, provider errors, cost, retrieval hit rate, abstentions, user corrections, and labeled outcome quality. Monitor failures by task type as well as in aggregate. Version prompts and data, set alert thresholds, and keep a rollback path."
      }
    ]
  },
  {
    "id": "creator_growth",
    "label": "creator growth and audience strategy",
    "tasks": [
      {
        "id": "audience_research",
        "ask": "learn what this audience actually values",
        "guidance": "Combine optional member interviews, observed participation, content responses, and direct feedback. Segment by needs and behavior rather than stereotypes, and note who was not represented. Separate signals from assumptions and use the smallest ethical research method that informs the decision."
      },
      {
        "id": "content_plan",
        "ask": "create a sustainable content plan",
        "guidance": "Choose repeatable content pillars tied to audience needs, assign a realistic cadence, and reserve space for timely ideas. Adapt concepts to each channel instead of blindly cross-posting. Measure meaningful responses and creator workload so the plan remains sustainable."
      },
      {
        "id": "campaign",
        "ask": "plan a focused community campaign",
        "guidance": "Define one audience, one objective, one message, a short timeline, and a clear call to action. Use consistent tracking and accessible assets. Avoid manufactured urgency or unsupported promises; compare the outcome with a baseline before repeating it."
      },
      {
        "id": "promotion",
        "ask": "write a promotion draft with accurate contributor credit",
        "guidance": "Explain what is actually available, why it may matter, and what action is requested. Verify factual claims, permissions, links, and contributor credits before publication. Keep it as a draft until an authorized person reviews it and publishing is confirmed."
      },
      {
        "id": "survey",
        "ask": "ask for feedback on content or a project",
        "guidance": "Ask a few specific questions about what worked, what was unclear, and what people want next. Keep it optional and brief, explain use of responses, and include an open response. Do not infer population-wide preferences from a small self-selected sample."
      },
      {
        "id": "launch",
        "ask": "plan a modest launch",
        "guidance": "Prepare the minimum deliverable, a clear announcement, a reliable destination, a support route, and a way to capture feedback. Assign launch-day ownership and pause criteria. Prioritize clarity and follow-through over hype, then compare results with the stated objective."
      },
      {
        "id": "community_health",
        "ask": "grow participation without manipulating members",
        "guidance": "Make useful contributions easy, respond consistently, recognize real work with consent, and let members control participation. Avoid guilt, false scarcity, spam, and opaque rankings. Track member value and safety, not just notification clicks."
      },
      {
        "id": "resources",
        "ask": "allocate limited time and resources",
        "guidance": "List outcomes, effort, dependencies, and cost for each option. Protect essential safety and reliability work, then prioritize experiments with high information value and low downside. Make trade-offs visible and set a review date for deferred work."
      },
      {
        "id": "brand_voice",
        "ask": "keep the brand voice consistent across posts",
        "guidance": "Define voice attributes, vocabulary preferences, and examples to avoid. Adapt length and format to the channel while keeping claims and personality consistent. Preserve the creator's own voice and review sensitive or factual claims."
      },
      {
        "id": "retrospective",
        "ask": "review a campaign or growth experiment",
        "guidance": "Compare the objective with observed outcomes, effort, feedback, and unintended effects. Note sample size, time window, and confounders. Decide what to repeat, change, or stop and record a follow-up test rather than declaring success from one spike."
      }
    ]
  }
];

export function fillTemplate(template, values) {
  return String(template).replace(/\{([a-z_]+)\}/gi, (_, key) => String(values[key] ?? ""));
}

export function buildTrainingExamples() {
  const rows = [];
  for (const domain of DOMAINS) {
    for (const task of domain.tasks) {
      for (const niche of NICHES) {
        for (const situation of SITUATIONS) {
          const values = { niche: niche.label, audience: niche.audience, situation: situation.text, constraint: situation.constraint };
          const index = domain.tasks.indexOf(task) * NICHES.length * SITUATIONS.length
            + NICHES.indexOf(niche) * SITUATIONS.length + SITUATIONS.indexOf(situation) + 1;
          rows.push({
            id: "qth-v" + DATASET_VERSION.split(".")[0] + "-" + domain.id + "-" + String(index).padStart(4, "0"),
            version: DATASET_VERSION,
            domain: domain.id,
            intent: task.id,
            tags: [...new Set([domain.id, task.id, niche.id, situation.id])],
            input: fillTemplate("I create {niche} content for {audience}. My situation: {situation} Please help me {ask}.",
              { ...values, ask: task.ask }),
            ideal_response: fillTemplate(task.guidance, values),
            provenance: "synthetic_template_seed_v1",
            review_status: "synthetic_unreviewed",
          });
        }
      }
    }
  }
  return rows;
}
