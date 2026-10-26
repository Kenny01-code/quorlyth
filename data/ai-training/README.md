# QuorlythBot task-guidance corpus

## Version 1.0.0 — 10,000 examples

This corpus contains exactly 10,000 **synthetic instruction/response examples** across ten Quorlyth-related domains. Each domain contains ten task intents, ten creator/audience niches, and ten operating scenarios (10 x 10 x 10 = 1,000 examples per domain).

Domains include idea design, community design, project delivery, collaboration, analytics, automation, moderation and privacy, product UX, ML/data science, and creator growth.

**Important ML distinction:** this does not change model weights and is not equivalent to fine-tuning. The live app uses this versioned dataset as a retrieval-augmented, few-shot guidance corpus. The examples are marked synthetic_unreviewed so QuorlythBot should use them as response patterns, not as proof of facts or real user activity. Human review and a held-out evaluation set should be added before promoting these examples as a production-quality supervised training set.

## Add more data later

1. Add or refine task-specific guidance in scripts/ai-training-catalog.mjs.
2. For a new version, update DATASET_VERSION, the generator output directory, and manifest expectations deliberately.
3. Run npm run ai:data:generate and npm run ai:data:validate.
4. Review provenance, near-duplicates, coverage, safety, and evaluation scores before deploying new shards.
5. Add source-backed or human-reviewed examples with review_status such as reviewed and accurate provenance. Do not put private member data or unverified feedback into shared retrieval/training data.

The runtime retriever loads versioned JSONL shards from data/ai-training/** with lexical matching, adds only a few relevant examples to the model context, and falls back cleanly if the corpus is missing. Weak retrieval should never prevent normal provider calls.
