import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const IDS = {
  owner: '282af51e-6297-4fe4-a920-089facc48ba0',
  member: '53737ad1-9720-4c8a-84b5-e116ec79f198',
  applicant: '203bf851-ccd8-4b1e-bd8d-a5a58194a9ab',
  outsider: '7d88fcc2-e231-4181-b30b-a8708a7ad6dc',
}
const communityId = 'community1'
const ideaId = 'idea1'

const bootstrap = [
  'create role anon;',
  'create role authenticated;',
  'create role service_role;',
  'create schema auth;',
  "create table auth.users (id uuid primary key, email text unique, email_confirmed_at timestamptz, raw_app_meta_data jsonb not null default '{}');",
  "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;",
  "create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb,'{}'::jsonb) $$;",
  "create table public.docs (path text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());",
  'alter table public.docs enable row level security;',
  "create table public.access_requests (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), full_name text not null, email text not null, message text not null, status text not null default 'pending', created_at timestamptz not null default now());",
  'alter table public.access_requests enable row level security;',
  "create table public.workspace_members (email text primary key, full_name text not null, status text not null, user_id uuid references auth.users(id), updated_at timestamptz not null default now());",
  'alter table public.workspace_members enable row level security;',
  "create table public.workspace_records (collection_path text not null, record_id text not null, data jsonb not null default '{}', updated_at timestamptz not null default now(), primary key(collection_path,record_id));",
  'alter table public.workspace_records enable row level security;',
  'create function public.is_quorlyth_owner() returns boolean language sql as $$ select false $$;',
  'create function public.is_quorlyth_member() returns boolean language sql as $$ select false $$;',
  'create function public.can_manage_community(text) returns boolean language sql as $$ select false $$;',
  'create function public.can_view_community(text) returns boolean language sql as $$ select false $$;',
  'create function public.can_post_to_community(text) returns boolean language sql as $$ select false $$;',
  'create function public.idea_community_id(text) returns text language sql as $$ select null::text $$;',
  'create function public.is_idea_author(text) returns boolean language sql as $$ select false $$;',
  'create function public.is_chat_call_participant(text) returns boolean language sql as $$ select false $$;',
  'create function public.is_chat_member(text) returns boolean language sql as $$ select false $$;',
  'create function public.is_chat_message_sender(text) returns boolean language sql as $$ select false $$;',
  'create function public.can_read_quorlyth_record(text) returns boolean language sql as $$ select false $$;',
  'create function public.can_write_quorlyth_record(text,text,jsonb) returns boolean language sql as $$ select false $$;',
  'create function public.owner_claim_exists() returns boolean language sql as $$ select false $$;',
  "insert into auth.users(id,email,email_confirmed_at) values ('" + IDS.owner + "','creator@example.test',now()),('" + IDS.member + "','member@example.test',now()),('" + IDS.applicant + "','applicant@example.test',now()),('" + IDS.outsider + "','outsider@example.test',now());",
  "insert into public.docs(path,data) values " +
    "('config/owner','{\"id\":\"" + IDS.owner + "\"}')," +
    "('communities/" + communityId + "','{\"name\":\"Fan Ideas\",\"ownerId\":\"" + IDS.owner + "\",\"createdBy\":\"" + IDS.owner + "\",\"purpose\":\"Share ideas\",\"rules\":\"Be kind\",\"vis\":\"listed\",\"post\":\"members\",\"at\":1}')," +
    "('communities/archived','{\"name\":\"Archived\",\"ownerId\":\"" + IDS.owner + "\",\"createdBy\":\"" + IDS.owner + "\",\"vis\":\"listed\",\"post\":\"members\",\"arch\":true,\"at\":1}')," +
    "('ideas/" + ideaId + "','{\"title\":\"Fan meetup\",\"body\":\"A community meetup idea\",\"cid\":\"" + communityId + "\",\"authorId\":\"" + IDS.member + "\",\"tags\":[\"community\"],\"at\":2}')," +
    "('members/" + IDS.member + "','{\"c\":{\"" + communityId + "\":true,\"archived\":true}}')," +
    "('members/" + IDS.applicant + "','{\"c\":{\"" + communityId + "\":true}}')," +
    "('members/" + IDS.outsider + "','{\"c\":{}}');",
].join('\n')

test('security migration locks creator data and supports the real collaboration-to-project workflow', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())

  await db.exec(bootstrap)
  await db.query("insert into public.docs(path,data) values ('settings/space',$1::jsonb)", [JSON.stringify({ appr: false, name: 'Fan Space' })])
  const migration = await readFile(new URL('../supabase/migrations/20261014075832_security_hardening_owner_scoped_access.sql', import.meta.url), 'utf8')
  assert.ok(migration.includes('create policy docs_read_scoped'))
  assert.ok(migration.includes('create policy docs_insert_scoped'))
  await db.exec(migration)
  const managerGrant = await readFile(new URL('../supabase/migrations/20261015070600_grant_manage_community_rls_exec.sql', import.meta.url), 'utf8')
  await db.exec(managerGrant)
  await t.test('community request RLS helper can run for authenticated users but not anonymous visitors', async () => {
    const { rows } = await db.query("select has_function_privilege('authenticated', 'private.can_manage_community(text)', 'EXECUTE') as authenticated_can_execute, has_function_privilege('anon', 'private.can_manage_community(text)', 'EXECUTE') as anon_can_execute")
    assert.equal(rows[0].authenticated_can_execute, true)
    assert.equal(rows[0].anon_can_execute, false)
  })

  const assume = async (userId, role = 'authenticated') => {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId])
    await db.exec('set role ' + role)
  }
  const read = async (path) => db.query('select data from public.docs where path = $1', [path])
  const count = async (path) => (await db.query('select count(*)::int as n from public.docs where path = $1', [path])).rows[0].n
  const insertDoc = async (path, data) => db.query('insert into public.docs(path,data) values ($1,$2::jsonb)', [path, JSON.stringify(data)])
  const upsertDoc = async (path, data) => {
    const result = await db.query(
      'insert into public.docs(path,data) values ($1,$2::jsonb) on conflict(path) do update set data=excluded.data returning path',
      [path, JSON.stringify(data)],
    )
    if (result.rowCount === 0) throw new Error('Upsert denied by row-level security or record missing: ' + path)
    return result
  }
  const updateDoc = async (path, data) => {
    const result = await db.query('update public.docs set data=$2::jsonb where path=$1', [path, JSON.stringify(data)])
    if (result.rowCount === 0) throw new Error('Update denied by row-level security or record missing: ' + path)
    return result
  }
  const deleteDoc = async (path) => {
    const result = await db.query('delete from public.docs where path=$1', [path])
    if (result.rowCount === 0) throw new Error('Delete denied by row-level security or record missing: ' + path)
    return result
  }

  await t.test('owner identity uses the database role seed, not an email or a client claim', async () => {
    await assume(IDS.owner)
    assert.equal((await db.query('select private.is_platform_owner() as allowed')).rows[0].allowed, true)
    await assume(IDS.outsider)
    assert.equal((await db.query('select private.is_platform_owner() as allowed')).rows[0].allowed, false)
    await assert.rejects(insertDoc('config/owner', { id: IDS.outsider }))
  })

  await t.test('members see idea outcomes but not creator-only score/rationale or unlisted communities', async () => {
    await assume(IDS.owner)
    await insertDoc('reviews/' + ideaId, { status: 'selected', score: 82, f: 80, o: 75, r: 90, reason: 'Private creator rationale', at: 3 })
    await assert.rejects(insertDoc('ideaOutcomes/' + ideaId, { ideaId, status: 'declined', at: 4 }))

    const outcome = (await read('ideaOutcomes/' + ideaId)).rows[0].data
    assert.deepEqual(Object.keys(outcome).sort(), ['at', 'ideaId', 'status'])
    assert.equal(outcome.status, 'selected')

    await assume(IDS.member)
    assert.equal(await count('ideas/' + ideaId), 1)
    assert.equal(await count('reviews/' + ideaId), 0)
    assert.equal((await read('ideaOutcomes/' + ideaId)).rows[0].data.status, 'selected')
    await assert.rejects(insertDoc('reviews/' + ideaId, { status: 'declined', score: 0, reason: 'spoof' }))

    await assume(IDS.owner)
    await insertDoc('communities/private-lounge', {
      name: 'Private lounge', ownerId: IDS.owner, createdBy: IDS.owner,
      purpose: 'Unlisted', vis: 'unlisted', post: 'members', at: 1,
    })
    await assume(IDS.outsider)
    assert.equal(await count('communities/private-lounge'), 0)
    assert.equal(await count('data/users/' + IDS.member + '/billing'), 0)
    await assert.rejects(updateDoc('members/' + IDS.outsider, {
      c: { 'private-lounge': true },
    }))
  })

  await t.test('upserts preserve archived memberships but cannot move an idea across communities', async () => {
    await assume(IDS.member)
    await upsertDoc('members/' + IDS.member, { c: { [communityId]: true, archived: true } })
    assert.equal((await read('members/' + IDS.member)).rows[0].data.c.archived, true)

    await db.exec('reset role')
    await db.query(
      "insert into public.docs(path,data) values ('communities/second',$1::jsonb)",
      [JSON.stringify({ name: 'Second', ownerId: IDS.owner, createdBy: IDS.owner, vis: 'listed', post: 'anyone', at: 1 })],
    )
    await assume(IDS.member)
    await assert.rejects(upsertDoc('ideas/' + ideaId, {
      title: 'Fan meetup', body: 'Trying to move the idea.',
      cid: 'second', authorId: IDS.member, tags: ['community'], at: 2,
    }))
    assert.equal((await read('ideas/' + ideaId)).rows[0].data.cid, communityId)
  })

  await t.test('a second member can comment, vote, and apply; invalid evidence is rejected', async () => {
    await assume(IDS.member)
    await insertDoc('data/users/' + IDS.member + '/private-note', { secret: 'member-only' })
    await assert.rejects(insertDoc('data/users/' + IDS.applicant + '/forged-note', { secret: 'forged' }))
    await assume(IDS.owner)
    assert.equal(await count('data/users/' + IDS.member + '/private-note'), 0)
    await assume(IDS.member)
    assert.equal((await read('data/users/' + IDS.member + '/private-note')).rows[0].data.secret, 'member-only')

    await assume(IDS.applicant)
    await insertDoc('ideas/' + ideaId + '/comments/comment1', {
      authorId: IDS.applicant,
      text: 'This <script>alert(1)</script> meetup sounds useful.',
      at: 4,
    })
    const comment = (await read('ideas/' + ideaId + '/comments/comment1')).rows[0].data
    assert.doesNotMatch(comment.text, /<|>/)
    assert.match(comment.text, /meetup sounds useful/)

    await insertDoc('votes/' + IDS.applicant, { ideas: { [ideaId]: true } })
    assert.equal((await read('votes/' + IDS.applicant)).rows[0].data.ideas[ideaId], true)
    await assert.rejects(insertDoc('votes/' + IDS.applicant, { ideas: { imaginaryIdea: true } }))

    await insertDoc('volunteers/app1', {
      ideaId, applicantId: IDS.applicant, message: 'I can help organize the event.',
      status: 'pending', at: 5,
    })
    assert.equal((await read('volunteers/app1')).rows[0].data.status, 'pending')
    await assert.rejects(insertDoc('volunteers/app2', {
      ideaId, applicantId: IDS.applicant, message: 'Duplicate active application',
      status: 'pending', at: 6,
    }))
    await assert.rejects(insertDoc('volunteers/fake-owner', {
      ideaId, applicantId: IDS.owner, message: 'Invented application', status: 'pending', at: 6,
    }))
  })

  await t.test('idea submissions are rate-limited per authenticated account', async () => {
    await assume(IDS.member)
    for (let i = 0; i < 4; i += 1) {
      await upsertDoc('ideas/idea1', {
        title: 'Fan meetup', body: 'An idea with a safe edit.',
        cid: communityId, authorId: IDS.member, tags: ['community'], at: 2,
      })
    }
    for (let i = 0; i < 10; i += 1) {
      await insertDoc('ideas/burst' + i, {
        title: 'Burst idea ' + i, body: 'Submission within allowed hourly budget.',
        cid: communityId, authorId: IDS.member, tags: [], at: 20 + i,
      })
    }
    await assert.rejects(insertDoc('ideas/burst-limit', {
      title: 'Too many ideas', body: 'This exceeds the hourly allowance.',
      cid: communityId, authorId: IDS.member, tags: [], at: 40,
    }), /rate limit/i)
  })

  await t.test('only the creator can decide collaboration and create/update project milestones', async () => {
    await assume(IDS.applicant)
    await assert.rejects(updateDoc('volunteers/app1', {
      ideaId, applicantId: IDS.applicant, message: 'I can help',
      status: 'accepted', reviewedAt: 7, reviewedBy: IDS.applicant, at: 5,
    }))

    await assume(IDS.owner)
    await upsertDoc('volunteers/app1', {
      ideaId, applicantId: IDS.applicant, message: 'I can help organize the event.',
      status: 'accepted', reviewedAt: 7, reviewedBy: IDS.owner, at: 5,
    })
    assert.equal((await read('volunteers/app1')).rows[0].data.status, 'accepted')

    await insertDoc('projects/' + ideaId, {
      ideaId, summary: 'Plan the meetup', status: 'active', createdBy: IDS.owner, at: 8,
    })
    await insertDoc('milestones/m1', {
      projectId: ideaId, title: 'Choose a date', description: 'Ask community members.',
      status: 'todo', createdBy: IDS.owner, at: 9,
    })
    await upsertDoc('milestones/m1', {
      projectId: ideaId, title: 'Choose a date', description: 'Ask community members.',
      status: 'in_progress', createdBy: IDS.owner, at: 9, updatedAt: 10,
    })
    await assume(IDS.member)
    assert.equal((await read('projects/idea1')).rows[0].data.status, 'active')
    assert.equal((await read('milestones/m1')).rows[0].data.status, 'in_progress')
    await assert.rejects(updateDoc('milestones/m1', {
      projectId: ideaId, title: 'Take over', description: '', status: 'completed',
      createdBy: IDS.member, at: 9, updatedAt: 11,
    }))
  })

  await t.test('chat calls bind both parties and ICE signals to the real conversation', async () => {
    await assume(IDS.member)
    await insertDoc('conversations/chat1', {
      title: '', type: 'direct', members: [IDS.member, IDS.applicant],
      createdBy: IDS.member, createdAt: 100,
    })
    await insertDoc('calls/call1', {
      id: 'call1', conversationId: 'chat1', callerId: IDS.member, calleeId: IDS.applicant,
      mode: 'voice', state: 'preparing', createdAt: 101,
    })
    await upsertDoc('calls/call1', {
      id: 'call1', conversationId: 'chat1', callerId: IDS.member, calleeId: IDS.applicant,
      mode: 'voice', state: 'ringing', createdAt: 101,
      offer: { type: 'offer', sdp: 'fake-sdp-for-policy-test' },
    })
    await insertDoc('callSignals/signal1', {
      id: 'signal1', callId: 'call1', conversationId: 'chat1',
      fromId: IDS.member, toId: IDS.applicant, candidate: { candidate: 'candidate:test' }, at: 102,
    })
    assert.equal(await count('callSignals/signal1'), 0)

    await assume(IDS.applicant)
    assert.equal(await count('calls/call1'), 1)
    assert.equal(await count('callSignals/signal1'), 1)
    await assert.rejects(insertDoc('calls/spoofed', {
      id: 'spoofed', conversationId: 'chat1', callerId: IDS.member, calleeId: IDS.applicant,
      mode: 'voice', state: 'ringing', createdAt: 103,
    }))
    await assert.rejects(insertDoc('callSignals/signal-spoofed', {
      id: 'signal-spoofed', callId: 'call1', conversationId: 'chat1',
      fromId: IDS.member, toId: IDS.outsider, candidate: { candidate: 'candidate:spoof' }, at: 104,
    }))
    await assert.rejects(updateDoc('calls/call1', {
      id: 'call1', conversationId: 'chat1', callerId: IDS.outsider, calleeId: IDS.applicant,
      mode: 'voice', state: 'accepted', createdAt: 101,
      offer: { type: 'offer', sdp: 'spoofed' },
    }))

    await upsertDoc('calls/call1', {
      id: 'call1', conversationId: 'chat1', callerId: IDS.member, calleeId: IDS.applicant,
      mode: 'voice', state: 'accepted', createdAt: 101,
      offer: { type: 'offer', sdp: 'fake-sdp-for-policy-test' },
      answer: { type: 'answer', sdp: 'fake-answer-for-policy-test' },
    })
    assert.equal((await read('calls/call1')).rows[0].data.state, 'accepted')
    await assert.rejects(deleteDoc('conversations/chat1'))

    await assume(IDS.outsider)
    assert.equal(await count('calls/call1'), 0)
    assert.equal(await count('callSignals/signal1'), 0)
  })

  await t.test('legacy workspace records keep account data scoped and enforce own-row writes', async () => {
    await db.exec('reset role')
    await db.query(
      "insert into public.workspace_members(email,full_name,status,user_id) values ('member@example.test','Member','approved',$1)",
      [IDS.member],
    )
    await db.query(
      "insert into public.workspace_records(collection_path,record_id,data) values " +
      "('votes',$1,$2::jsonb),('votes',$3,$4::jsonb),('members',$1,$5::jsonb),('decisions',$1,$6::jsonb),('ideas','legacy1',$7::jsonb)",
      [IDS.member, '{"ideas":{"idea1":true}}', IDS.applicant, '{"ideas":{"idea1":false}}',
       '{"c":{"community1":true}}', '{"status":"approved"}', '{"title":"Legacy idea"}'],
    )
    await assume(IDS.member)
    const visibleVotes = await db.query("select record_id from public.workspace_records where collection_path='votes'")
    assert.deepEqual(visibleVotes.rows.map(r => r.record_id), [IDS.member])
    assert.equal((await db.query("select count(*)::int n from public.workspace_records where collection_path='members'")).rows[0].n, 1)
    assert.equal((await db.query("select count(*)::int n from public.workspace_records where collection_path='decisions'")).rows[0].n, 1)
    assert.equal((await db.query("select count(*)::int n from public.workspace_records where collection_path='ideas'")).rows[0].n, 1)
    await db.query(
      "insert into public.workspace_records(collection_path,record_id,data) values ('votes',$1,$2::jsonb) " +
      "on conflict(collection_path,record_id) do update set data=excluded.data",
      [IDS.member, '{"ideas":{"idea1":true}}'],
    )
    await assert.rejects(db.query(
      "insert into public.workspace_records(collection_path,record_id,data) values ('votes',$1,$2::jsonb)",
      [IDS.outsider, '{"ideas":{"idea1":true}}'],
    ))
  })

  await t.test('promotions stay drafts and members cannot mutate creator-only records', async () => {
    await assume(IDS.owner)
    await insertDoc('promotions/p1', {
      ideaId, text: 'We are preparing a meetup announcement.', by: IDS.owner, credits: [IDS.member],
      at: 11, status: 'draft', published: false,
    })
    const draft = (await read('promotions/p1')).rows[0].data
    assert.equal(draft.status, 'draft')
    assert.equal(draft.published, false)
    await assert.rejects(insertDoc('promotions/pretend-published', {
      ideaId, text: 'Published!', by: IDS.owner, credits: [], at: 12,
      status: 'published', published: true, externalPostId: 'fake-post',
    }))

    await assume(IDS.outsider)
    assert.equal(await count('promotions/p1'), 0)
    assert.equal(await count('settings/space'), 1)
    await assert.rejects(updateDoc('communities/' + communityId, {
      name: 'Taken over', ownerId: IDS.outsider, createdBy: IDS.outsider, vis: 'listed', post: 'anyone', at: 1,
    }))
  })

  await t.test('anonymous users can discover listed ideas but cannot write shared records', async () => {
    await assume(IDS.outsider, 'anon')
    assert.equal(await count('ideas/' + ideaId), 1)
    await assert.rejects(insertDoc('ideas/anon-idea', {
      title: 'anonymous', body: 'no', cid: communityId, authorId: IDS.outsider, tags: [], at: 13,
    }))
  })
})
