# QuorlythBot task-guidance corpus

## Versions 1.0.0 and 2.0.0 — 20,000 examples

This versioned corpus contains 20,000 **synthetic instruction/response examples** across twenty domains. Version 1.0.0 retains the original 10,000 product/task examples. Version 2.0.0 adds 10,000 voice/realtime examples covering natural expression, turn-taking, app-wide invocation, latency, accessibility, voice privacy, safe tools, recovery, context accuracy, and evaluation. The v2 snapshot is generated from task-specific templates, ten operating scenarios and ten phrasing variations (1,000 examples per domain).

**Important ML distinction:** this does not change model weights and is not equivalent to fine-tuning. The live app uses these versioned datasets as retrieval-augmented guidance. A small, bounded voice example is retrieved for native Realtime sessions when prompt space permits. The examples are marked synthetic_unreviewed so QuorlythBot should use them as response patterns, not as proof of facts or real user activity. Human review and a held-out evaluation set should be added before promoting these examples as a production-quality supervised training set.

## Add more data later

1. Add product guidance in scripts/ai-training-catalog.mjs or voice guidance in scripts/voice-training-catalog.mjs.
2. Use a new version folder and IDs when creating a new snapshot.
3. Run npm run ai:data:generate, npm run ai:voice-data:generate, and npm run ai:data:validate.
4. Review provenance, near-duplicates, coverage, safety, and evaluation results before promoting new shards.
5. Add source-backed or human-reviewed examples with review_status such as reviewed or source_verified and accurate provenance. Do not put private member data or unverified feedback into shared retrieval/training data.

Older versions stay in place for reproducibility. The server loads all versioned JSONL shards under data/ai-training/**, and Vercel is configured to bundle the matching data files. Retrieval adds only a few relevant examples to model context and falls back cleanly if the corpus is missing.


## Voice data: version 2.0.0

The v2 corpus covers natural vocal reactions, live turn-taking, app-wide invocation, interruptions, accessibility, data minimization, safe tools, provider recovery and measurable quality. These are **not recorded human conversations** and do not fine-tune the model's audio weights. Private audio must not enter shared training data without explicit consent and retention/privacy review.

Do not inflate the corpus with hundreds of thousands of near-identical synthetic variants just to raise the count: large runtime indexes can hurt cold starts and latency. Prefer source-verified engineering documentation, consented human-reviewed dialogue, deduplication and a held-out evaluation suite before future promotion.
