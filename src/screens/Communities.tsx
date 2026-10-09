import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Gate } from '../components/Gate'
import { IdeaCard } from '../components/IdeaCard'
import { Av, Chip, Empty, Head } from '../components/ui'
import { useApp } from '../data/AppProvider'
import { Community } from '../lib/types'
import { cleanTag, cn } from '../lib/util'
import { ShareCard } from '../components/ShareCard'
import { useDraftState } from '../lib/useDraftState'

const ICONS = ['community', 'idea', 'audience', 'promote', 'rank', 'member', 'insight', 'collab']
const COVERS = [['a', 'Aurora'], ['b', 'Halo'], ['c', 'Grid'], ['d', 'Dusk']]
const RULE = { anyone: 'Anyone can post', members: 'Members can post', owner: 'Owner posts only' }

export function Cover({ c, big }: { c: Community; big?: boolean }) {
  return <div className={cn('ccv', 'v' + (c.cover || 'a'))}><span className="cic"><Icon name={c.icon || 'community'} size={big ? 44 : 30} /></span></div>
}

export function Communities() {
  const { cid } = useParams()
  return <Gate>{cid ? <Detail cid={cid} /> : <List />}</Gate>
}

function Pick({ label, value, onChange, opts }: { label: string; value: string; onChange: (v: string) => void; opts: [string, React.ReactNode][] }) {
  return (
    <div className="field"><span>{label}</span>
      <div className="acts" style={{ margin: 0, gap: 6 }}>{opts.map(([k, l]) => <Chip key={k} on={value === k} onClick={() => onChange(k)}>{l}</Chip>)}</div></div>
  )
}

function List() {
  const a = useApp()
  const nav = useNavigate()
  const { data } = a
  const [filter, setFilter] = useState<'all' | 'owned' | 'joined' | 'discover'>('all')
  const emptyCommunity = { name: '', purpose: '', icon: 'community', cover: 'a', vis: 'listed', post: 'anyone' }
  const [f, setF, clearDraft] = useDraftState(`q-draft:${a.me?.id}:community:new`, emptyCommunity)
  const members = (id: string) => Object.keys(data.members).filter(u => data.members[u]?.[id]).length
  const visible = data.communities.filter(c => c.vis !== 'unlisted' || a.canManageCommunity(c.id) || a.joined(c.id))
  const shown = visible.filter(c => filter === 'owned' ? a.canManageCommunity(c.id) : filter === 'joined' ? a.joined(c.id) && !a.canManageCommunity(c.id) : filter === 'discover' ? !a.joined(c.id) && !a.canManageCommunity(c.id) && c.vis !== 'unlisted' : true)
  return (
    <>
      <Head kicker="Communities" title="Where ideas gather." right={a.me ? <button className="btn p" onClick={() => document.getElementById('newc')?.scrollIntoView({ behavior: 'smooth' })}><Icon name="contribute" size={16} />New community</button> : null} />
      <div className="acts" style={{ margin: '12px 0 18px', flexWrap: 'wrap' }}>
        {([['all', 'All communities'], ['owned', 'My communities'], ['joined', 'Joined'], ['discover', 'Discover']] as const).map(([key, label]) => <button key={key} className={cn('chip', filter === key && 'on')} onClick={() => setFilter(key)}>{label}</button>)}
      </div>
      {shown.length ? (
        <div className="grid g3">
          {shown.map(c => {
            const n = data.ideas.filter(i => i.cid === c.id).length, m = members(c.id)
            return (
              <div key={c.id} className="glass lift ccl">
                <Cover c={c} />
                <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{c.vis === 'unlisted' && <span className="chip">Unlisted</span>}{c.arch && <span className="chip on">Archived</span>}{a.canManageCommunity(c.id) && <span className="chip">Owned by you</span>}</div>
                  <h3 style={{ fontSize: 20, fontWeight: 300 }}>{c.name}</h3>
                  <p className="mut">{c.purpose}</p>
                  <p className="dim">Created by {c.ownerId || c.createdBy ? a.nm((c.ownerId || c.createdBy)!) : 'Community creator'}</p>
                  <p className="dim" style={{ marginTop: 'auto' }}>{m} member{m === 1 ? '' : 's'}, {n} idea{n === 1 ? '' : 's'}</p>
                  <div className="acts" style={{ margin: 0 }}>
                    <button className="btn p" style={{ padding: '10px 20px' }} onClick={() => nav('/communities/' + c.id)}>Open</button>
                    {a.canManageCommunity(c.id) && <button className="btn" style={{ padding: '10px 20px' }} onClick={() => nav('/communities/' + c.id + '?preview=member')}><Icon name="eye2" size={16} />View community</button>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : <Empty icon="community" title="No communities yet" text={a.me ? 'Create a community or discover one shared by others.' : 'Sign in to create and join communities.'} />}
      {a.me && (
        <div className="glass pad" id="newc" style={{ marginTop: 22, maxWidth: 720 }}>
          <h3>New community</h3>
          <p className="dim" style={{ marginTop: 4 }}>Your unfinished changes are saved as a draft on this device.</p>
          <label className="field"><span>Name</span><input value={f.name} maxLength={60} onChange={e => setF({ ...f, name: e.target.value })} placeholder="For example, Behind the scenes" /></label>
          <label className="field"><span>What is it for</span><textarea value={f.purpose} maxLength={300} onChange={e => setF({ ...f, purpose: e.target.value })} placeholder="Share ideas for what I make next" /></label>
          <Pick label="Icon" value={f.icon} onChange={v => setF({ ...f, icon: v })} opts={ICONS.map(i => [i, <Icon key={i} name={i} size={18} />])} />
          <div className="field"><span>Cover style</span><div className="cover-picker">{COVERS.map(([key, label]) => <button type="button" key={key} className={cn('cover-option', f.cover === key && 'on')} aria-pressed={f.cover === key} onClick={() => setF({ ...f, cover: key })}><span className={cn('ccv', 'v' + key)}><span className="cover-sample">{label.slice(0,1)}</span></span><b>{label}</b></button>)}</div></div>
          <Pick label="Visibility" value={f.vis} onChange={v => setF({ ...f, vis: v })} opts={[['listed', 'Listed'], ['unlisted', 'Unlisted']]} />
          <Pick label="Who can post" value={f.post} onChange={v => setF({ ...f, post: v })} opts={[['anyone', 'Anyone'], ['members', 'Members'], ['owner', 'Owner only']]} />
          <div className="acts"><button className="btn p" onClick={async () => { if (!f.name.trim()) return a.toast('Give it a name'); if (await a.createCommunity({ ...f, name: f.name.trim() } as any)) clearDraft(emptyCommunity) }}>Create community</button><button className="btn" onClick={() => clearDraft(emptyCommunity)}>Discard draft</button></div>
        </div>
      )}
    </>
  )
}

type Preview = null | 'visitor' | 'member'

function Detail({ cid }: { cid: string }) {
  const a = useApp()
  const nav = useNavigate()
  const { data } = a
  const c = data.communities.find(x => x.id === cid)
  const [tab, setTab] = useState(0)
  const [preview, setPreview] = useState<Preview>(() => (new URLSearchParams(location.search).get('preview') as Preview) || null)
  const [sort, setSort] = useState(0)
  const [tag, setTag] = useState('')
  const emptyIdea = { title: '', body: '', tags: '' }
  const [f, setF, clearIdeaDraft] = useDraftState(`q-draft:${a.me?.id}:idea:${cid}`, emptyIdea)
  if (!c) return <Empty icon="community" title="Community not found" text="It may have been removed."><button className="btn" style={{ marginTop: 12 }} onClick={() => nav('/communities')}>Back</button></Empty>

  const own = a.canManageCommunity(cid) && !preview
  const joined = preview === 'visitor' ? false : preview === 'member' ? true : a.joined(cid)
  const spaceOk = preview ? preview === 'member' || !data.settings?.appr : a.canPost()
  const rule = c.post || 'anyone'
  const canPost = !c.arch && (rule === 'owner' ? own : rule === 'members' ? own || joined : true) && (own || spaceOk)
  const mem = Object.keys(data.members).filter(u => data.members[u]?.[cid])
  let list = data.ideas.filter(i => i.cid === cid)
  if (tag) list = list.filter(i => i.tags?.includes(tag))
  list = [...list].sort(sort === 1 ? (x, y) => a.votesOf(y.id) - a.votesOf(x.id) : sort === 2 ? (x, y) => (data.reviews[y.id]?.score ?? -1) - (data.reviews[x.id]?.score ?? -1) : (x, y) => y.at - x.at)
  const pin = c.pinned ? data.ideas.find(i => i.id === c.pinned) : null
  const tags = Object.entries(list.reduce((o: Record<string, number>, i) => { (i.tags || []).forEach(t => (o[t] = (o[t] || 0) + 1)); return o }, {})).sort((x, y) => y[1] - x[1]).slice(0, 10).map(x => x[0])
  const tabs = ['Feed', 'About', 'Members', ...(own ? ['Insights', 'Settings'] : [])]

  async function post() {
    if (!f.title.trim()) return a.toast('Give your idea a title')
    if (preview) return a.toast('This is a preview. Nothing is saved.')
    if (await a.postIdea({ title: f.title.trim(), body: f.body.trim(), cid, tags: [...new Set(f.tags.split(',').map(cleanTag).filter(Boolean))].slice(0, 3) })) clearIdeaDraft(emptyIdea)
  }

  return (
    <>
      {a.owner && (
        <div className="glass pvb">
          <span className="dim">{preview ? `Previewing as ${preview === 'member' ? 'a member' : 'a visitor'}. This is what people see.` : 'View this community as other people see it'}</span>
          <div className="acts" style={{ margin: 0, gap: 6 }}>
            <Chip on={preview === 'visitor'} onClick={() => { setPreview('visitor'); setTab(0) }}><Icon name="eye2" size={14} />Visitor</Chip>
            <Chip on={preview === 'member'} onClick={() => { setPreview('member'); setTab(0) }}><Icon name="member" size={14} />Member</Chip>
            {preview && <Chip onClick={() => setPreview(null)}>Exit preview</Chip>}
          </div>
        </div>
      )}
      <div className="glass ccard">
        <Cover c={c} big />
        <div className="cbody">
          <Chip onClick={() => nav('/communities')}>Back to communities</Chip>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '14px 0 8px' }}>
            <span className="chip">{c.vis === 'unlisted' ? 'Unlisted' : 'Listed'}</span><span className="chip">{RULE[rule]}</span>{c.arch && <span className="chip on">Archived</span>}
          </div>
          <h2>{c.name}</h2>
          <p className="mut" style={{ marginTop: 8, maxWidth: 620 }}>{c.purpose}</p>
          <div className="pw" style={{ marginTop: 18 }}>
            <span style={{ display: 'flex' }}>{mem.slice(0, 5).map(u => <Av key={u} id={u} size={28} />)}</span>
            <span className="dim">{mem.length} member{mem.length === 1 ? '' : 's'}</span>
            {!own && <button className={cn('btn', !joined && 'p')} style={{ marginLeft: 'auto' }} onClick={() => preview ? a.toast('This is a preview. Nothing is saved.') : a.join(cid, !joined)}><Icon name={joined ? 'approve' : 'community'} size={16} />{joined ? 'Joined' : 'Join community'}</button>}
          </div>
        </div>
      </div>
      <div className="ctabs">{tabs.map((t, i) => <Chip key={t} on={tab === i} onClick={() => setTab(i)}>{t}</Chip>)}</div>

      {tab === 0 && (
        <>
          {data.settings?.ann && <div className="glass pad" style={{ marginBottom: 18, display: 'flex', gap: 14 }}><Icon name="spark" size={20} /><p>{data.settings.ann}</p></div>}
          {canPost ? (
            <div className="glass pad" style={{ marginBottom: 22 }}>
              <h3>Share an idea</h3>
              <p className="dim" style={{ marginTop: 4 }}>Your unfinished idea is saved as a draft on this device.</p>
              <label className="field"><span>Title</span><input value={f.title} maxLength={120} onChange={e => setF({ ...f, title: e.target.value })} placeholder="A short name for it" /></label>
              <label className="field"><span>Details</span><textarea value={f.body} maxLength={2000} onChange={e => setF({ ...f, body: e.target.value })} placeholder="What should happen and why would people want it" /></label>
              <label className="field"><span>Tags</span><input value={f.tags} maxLength={70} onChange={e => setF({ ...f, tags: e.target.value })} placeholder="Up to three, separated by commas" /></label>
              <div className="acts" style={{ marginTop: 14 }}><button className="btn p" onClick={post}><Icon name="contribute" />Submit idea</button></div>
            </div>
          ) : (
            <div className="glass pad" style={{ marginBottom: 22, display: 'flex', gap: 14 }}><Icon name="private" size={22} />
              <p className="mut">{c.arch ? 'This community is archived. It is read only.' : rule === 'owner' ? 'Only the owner posts here.' : rule === 'members' && !joined ? 'Join this community to share ideas.' : 'The owner approves who can post.'}</p></div>
          )}
          {pin && <><p className="dim" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 8px' }}><Icon name="pin" size={14} />Pinned</p><div className="grid g3" style={{ marginBottom: 22 }}><IdeaCard idea={pin} /></div></>}
          <div style={{ marginBottom: 18 }}>{['New', 'Top backed', 'AI ranked'].map((l, i) => <span key={l}><Chip on={sort === i} onClick={() => setSort(i)}>{l}</Chip>{' '}</span>)}</div>
          {tags.length > 0 && <div style={{ margin: '-6px 0 18px' }}>{tags.map(t => <span key={t}><Chip on={tag === t} onClick={() => setTag(tag === t ? '' : t)}>{t}</Chip>{' '}</span>)}</div>}
          {list.length ? (
            <div className="grid g3">{list.map(i => <IdeaCard key={i.id} idea={i} extra={own && <button className="chip" style={{ alignSelf: 'flex-start' }} onClick={() => a.saveCommunity(cid, { pinned: c.pinned === i.id ? '' : i.id })}><Icon name="pin" size={13} />{c.pinned === i.id ? 'Unpin' : 'Pin'}</button>} />)}</div>
          ) : <Empty icon="idea" title="No ideas yet" text="Be the first to share one." />}
        </>
      )}

      {tab === 1 && (
        <>
          <div className="grid g2">
            <div className="glass pad"><h3>Welcome</h3><p className="mut" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{c.welcome || 'Welcome. Share what you would love to see next.'}</p></div>
            <div className="glass pad"><h3>Guidelines</h3><p className="mut" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{c.rules || 'Be kind, build on each other, and keep ideas specific.'}</p></div>
          </div>
          <div className="glass pad" style={{ marginTop: 18 }}><div className="stat3">
            <div><p className="dim">Members</p><p className="num">{mem.length}</p></div>
            <div><p className="dim">Ideas</p><p className="num">{data.ideas.filter(i => i.cid === cid).length}</p></div>
            <div><p className="dim">Created</p><p className="num" style={{ fontSize: 22, marginTop: 14 }}>{c.at ? new Date(c.at).toLocaleDateString() : ''}</p></div>
          </div></div>
        </>
      )}

      {tab === 2 && (
        <div className="glass pad"><h3 style={{ marginBottom: 8 }}>Members</h3>
          {mem.length && (own || joined) ? mem.map(u => (
            <div key={u} className="row" style={{ cursor: 'default' }}><Av id={u} size={38} />
              <div className="t"><h3 style={{ fontSize: 15 }}>{a.nm(u)}</h3><p className="dim">{data.profiles[u]?.head || 'Member'}</p></div>
              {own && <Chip onClick={() => a.backend!.store.update('members/' + u, { c: { [cid]: false } })}>Remove</Chip>}</div>
          )) : <p className="mut" style={{ padding: '18px 0' }}>{mem.length ? 'Join this community to see who is in it.' : 'No members yet.'}</p>}
        </div>
      )}

      {tab === 3 && own && <Insights cid={cid} />}
      {tab === 4 && own && <><CommunitySettings c={c} /><ShareCard title="Community invite link" url={location.origin + '/communities/' + c.id} sub="People with access open this community directly." /></>}
    </>
  )
}

function Insights({ cid }: { cid: string }) {
  const a = useApp()
  const nav = useNavigate()
  const ideas = a.data.ideas.filter(i => i.cid === cid)
  const au: Record<string, number> = {}
  let bk = 0
  ideas.forEach(i => { au[i.authorId] = (au[i.authorId] || 0) + 1; bk += a.votesOf(i.id) })
  const top = Object.keys(au).sort((x, y) => au[y] - au[x]).slice(0, 5)
  return (
    <>
      <div className="grid g4" style={{ marginBottom: 18 }}>
        {([['Members', Object.keys(a.data.members).filter(u => a.data.members[u]?.[cid]).length], ['Ideas', ideas.length], ['Backings', bk], ['In review', ideas.filter(i => a.statusOf(i.id) === 'review').length]] as [string, number][]).map(([l, v]) => <div key={l} className="glass pad"><p className="dim">{l}</p><p className="num" style={{ fontSize: 40 }}>{v}</p></div>)}
      </div>
      <div className="glass pad"><h3 style={{ marginBottom: 8 }}>Top contributors</h3>
        {top.length ? top.map(u => <div key={u} className="row" style={{ cursor: 'default' }}><Av id={u} size={30} /><div className="t"><h3 style={{ fontSize: 15 }}>{a.nm(u)}</h3></div><span>{au[u]}</span></div>) : <p className="mut">No contributions yet.</p>}
        <div className="acts"><button className="btn p" onClick={() => nav('/queue?c=' + cid)}><Icon name="queue" />Review this community</button></div></div>
    </>
  )
}

function CommunitySettings({ c }: { c: Community }) {
  const a = useApp()
  const nav = useNavigate()
  const initial = { name: c.name, purpose: c.purpose || '', icon: c.icon || 'community', cover: c.cover || 'a', vis: c.vis || 'listed', post: c.post || 'anyone', welcome: c.welcome || '', rules: c.rules || '', arch: !!c.arch }
  const [f, setF, clearDraft] = useDraftState(`q-draft:${a.me?.id}:community:settings:${c.id}`, initial)
  const [del, setDel] = useState(false)
  return (
    <div className="glass pad" style={{ maxWidth: 760 }}>
      <h3>Community settings</h3><p className="dim" style={{ marginTop: 4 }}>Your unfinished changes are saved as a draft on this device.</p>
      <div style={{ margin: '16px 0 20px' }}>
        <Cover c={{ ...c, cover: f.cover }} big />
        <p className="dim" style={{ marginTop: 8 }}>Live preview. Choosing a cover style saves it to the community immediately; use Save changes for the other settings.</p>
      </div>
      <label className="field"><span>Name</span><input value={f.name} maxLength={60} onChange={e => setF({ ...f, name: e.target.value })} /></label>
      <label className="field"><span>What is it for</span><textarea value={f.purpose} maxLength={300} onChange={e => setF({ ...f, purpose: e.target.value })} /></label>
      <Pick label="Icon" value={f.icon} onChange={v => setF({ ...f, icon: v })} opts={ICONS.map(i => [i, <Icon key={i} name={i} size={18} />])} />
      <div className="field"><span>Cover style</span><div className="cover-picker">{COVERS.map(([key, label]) => <button type="button" key={key} className={cn('cover-option', f.cover === key && 'on')} aria-pressed={f.cover === key} onClick={async () => {
          setF({ ...f, cover: key })
          if (key !== (c.cover || 'a')) {
            const saved = await a.saveCommunity(c.id, { cover: key })
            if (!saved) setF(current => ({ ...current, cover: c.cover || 'a' }))
          }
        }}><span className={cn('ccv', 'v' + key)}><span className="cover-sample">{label.slice(0,1)}</span></span><b>{label}</b></button>)}</div></div>
      <Pick label="Visibility" value={f.vis} onChange={v => setF({ ...f, vis: v as any })} opts={[['listed', 'Listed'], ['unlisted', 'Unlisted']]} />
      <Pick label="Who can post" value={f.post} onChange={v => setF({ ...f, post: v as any })} opts={[['anyone', 'Anyone'], ['members', 'Members'], ['owner', 'Owner only']]} />
      <label className="field"><span>Welcome message</span><textarea value={f.welcome} maxLength={400} onChange={e => setF({ ...f, welcome: e.target.value })} placeholder="Shown to new members" /></label>
      <label className="field"><span>Guidelines</span><textarea value={f.rules} maxLength={600} onChange={e => setF({ ...f, rules: e.target.value })} placeholder="A few simple rules" /></label>
      <div className="set"><div><h3 style={{ fontSize: 15 }}>Archive this community</h3><p className="dim">Read only. Nobody can post.</p></div>
        <button className={cn('tg', f.arch && 'on')} role="switch" aria-checked={f.arch} aria-label="Archive" onClick={() => setF({ ...f, arch: !f.arch })}><i /></button></div>
      <div className="acts">
        <button className="btn p" onClick={async () => { if (!f.name.trim()) return a.toast('Give it a name'); if (await a.saveCommunity(c.id, { ...f, name: f.name.trim() } as any)) clearDraft(f) }}>Save changes</button>
        <button className="btn" onClick={() => clearDraft(initial)}><Icon name="rotate" size={16} />Discard draft</button>
        <button className="btn" onClick={async () => { if (!del) return setDel(true); const ok = await a.deleteCommunity(c.id); if (ok) nav('/communities'); else setDel(false) }}>{del ? 'Confirm delete' : 'Delete'}</button>
      </div>
    </div>
  )
}
