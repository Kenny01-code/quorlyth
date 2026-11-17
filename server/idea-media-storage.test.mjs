import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('idea media storage is provisioned as private with author-scoped upload and idea-read policies', async () => {
  const [backend, migration] = await Promise.all([
    source('src/backend.ts'),
    source('supabase/migrations/20261117090000_idea_media_private_storage.sql'),
  ])

  assert.ok(backend.includes("sb.storage.from('quorlyth-idea-media').upload(path, file"))
  assert.ok(backend.includes("const path = [cid, userData.user.id, ideaId, crypto.randomUUID()].join('/')"))

  assert.ok(migration.includes("'quorlyth-idea-media'"))
  assert.ok(migration.includes('public = false'))
  assert.ok(migration.includes('  26214400,'), 'The private bucket must enforce the 25 MB file limit')
  assert.ok(migration.includes("'image/avif'"))
  assert.ok(migration.includes("'video/webm'"))
  assert.ok(migration.includes('for insert to authenticated'))
  assert.ok(migration.includes('(storage.foldername(name))[2] = (select auth.uid())::text'))
  assert.ok(migration.includes("idea.data->>'authorId' = (select auth.uid())::text"))
  assert.ok(migration.includes('for select to authenticated'))
  assert.ok(migration.includes('private.can_read_doc(idea.path, idea.data)'))
  assert.ok(migration.includes('for delete to authenticated'))
  assert.ok(migration.includes("attachment.value->>'path' = storage.objects.name"))
})

test('idea media upload failures identify the attachment and say the idea was not published', async () => {
  const app = await source('src/data/AppProvider.tsx')

  assert.ok(app.includes('let uploadingMediaFile: string | null = null'))
  assert.ok(app.includes('uploadingMediaFile = file.name'))
  assert.ok(app.includes('uploadingMediaFile = null'))
  assert.ok(app.includes('could not be uploaded, so your idea was not published.'))
})
