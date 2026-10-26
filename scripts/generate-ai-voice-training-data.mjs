#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildVoiceTrainingExamples, VOICE_DATASET_VERSION, VOICE_DOMAINS } from './voice-training-catalog.mjs'
const root=fileURLToPath(new URL('../data/ai-training/v2/',import.meta.url))
const rows=buildVoiceTrainingExamples()
if(rows.length!==10000)throw Error('Expected 10,000 voice examples; got '+rows.length)
await mkdir(root,{recursive:true});const counts={}
for(const [domain] of VOICE_DOMAINS){const part=rows.filter(x=>x.domain===domain);counts[domain]=part.length;if(part.length!==1000)throw Error(domain+' count mismatch');for(let i=0;i<2;i++){const chunk=part.slice(i*500,(i+1)*500);await writeFile(path.join(root,domain+'-'+(i+1)+'.jsonl'),chunk.map(x=>JSON.stringify(x)).join('\n')+'\n')}}
const manifest={name:'QuorlythBot voice and realtime guidance corpus',version:VOICE_DATASET_VERSION,total_examples:rows.length,domains:counts,provenance:'Generated from hand-authored voice, realtime, app-safety and evaluation templates.',status:'synthetic_unreviewed; retrieval guidance only; not fine-tuned weights or human-verified ground truth',format:'JSONL with input, ideal_response, tags, domain, intent, provenance and review_status',created_by:'scripts/generate-ai-voice-training-data.mjs',created_at:'2026-10-26'}
await writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n')
process.stdout.write('Generated '+rows.length+' voice examples.\n')
