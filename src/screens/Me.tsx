import { useParams } from 'react-router-dom'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Gate } from '../components/Gate'
import { CropModal } from '../components/CropModal'
import { ShareCard } from '../components/ShareCard'
import { IdeaCard } from '../components/IdeaCard'
import { Av, Empty, Head } from '../components/ui'
import { useApp } from '../data/AppProvider'
import { STATUS_LABEL } from '../lib/types'
import { useUserState } from '../lib/userState'
import { useDraftState } from '../lib/useDraftState'

export function Me() {
  const { id } = useParams()
  return <Gate>{id ? <Public id={id} /> : <Mine />}</Gate>
}

function Mine() {
  const a = useApp()
  const nav = useNavigate()
  const me = a.me!
  const us = useUserState()
  const saved = a.data.ideas.filter(i => us.st.saved?.[i.id])
  const q = a.data.profiles[me.id] || { id: me.id }
  const profileBase = { name: q.name || '', head: q.head || '', bio: q.bio || '' }
  const [f, setF, clearProfileDraft] = useDraftState(`q-draft:${me.id}:profile`, profileBase)
  const [crop, setCrop] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [menu, setMenu] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const my = a.data.ideas.filter(i => i.authorId === me.id).sort((x, y) => y.at - x.at)
  const joined = a.data.communities.filter(c => a.joined(c.id))
  const rc = my.reduce((n, i) => n + a.votesOf(i.id), 0)
  const url = location.origin + '/me/' + me.id
  const photo = photoPreview || q.photo || q.authAvatarUrl || me.avatarUrl || ''
  const avatarName = a.nm(me.id)
  const avatarInitials = avatarName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || 'M'

  const access: [string, string, string, boolean][] = [
    ['idea', 'Share ideas', 'Post to communities you join.', a.canPost()],
    ['support', 'Back and reply', 'Back ideas and join the discussion.', true],
    ['edit', 'Profile and photo', 'Edit your name, bio and cropped photo.', true],
    ['queue', 'AI review', 'Score and explain every idea.', a.owner],
    ['insight', 'Analytics', 'Charts built from your real activity.', a.owner],
    ['promote', 'Publish posts', 'Turn selected ideas into posts.', a.owner],
  ]

  return (
    <>
      <Head kicker="My space" title="Your profile." right={<><button className="btn" onClick={() => nav('/me/' + me.id)}><Icon name="review" size={16} />View public profile</button>{' '}<button className="btn" onClick={() => a.backend?.auth.signOut()}><Icon name="private" size={16} />Sign out</button></>} />
      <div className="grid g2" style={{ marginBottom: 18 }}>
        <div className="glass pad">
          <div className="pw">
            <div className="pwrap">
              <button className="pav" aria-label="Edit photo" aria-haspopup="menu" onClick={() => setMenu(!menu)}>
                <span className="pav-initials" aria-hidden="true">{avatarInitials}</span>{photo && <img alt="" src={photo} onError={e => { e.currentTarget.style.display = 'none' }} />}<span className="cam"><Icon name="edit" size={14} /></span>
              </button>
              {menu && (
                <div className="pmenu glass">
                  <button onClick={() => { setMenu(false); file.current?.click() }}><Icon name="camera" size={16} />Upload new photo</button>
                  {q.photo && <button onClick={async () => { setMenu(false); if (await a.saveProfile({ photo: '' })) setPhotoPreview('') }}><Icon name="decline" size={16} />Remove photo</button>}
                </div>
              )}
            </div>
            <div><span className="chip">{a.owner ? 'Owner' : 'Member'}</span></div>
          </div>
          <input ref={file} type="file" accept="image/*" className="hide" onChange={e => { const fl = e.target.files?.[0]; e.target.value = ''; if (fl) fl.size > 12e6 ? a.toast('That image is too large') : setCrop(fl) }} />
          <p className="dim" style={{ margin: '12px 0 0' }}>Profile edits are saved as a draft on this device until you save them.</p>
          <label className="field"><span>Display name</span><input value={f.name} maxLength={40} onChange={e => setF({ ...f, name: e.target.value })} placeholder={me.name} /></label>
          <label className="field"><span>Headline</span><input value={f.head} maxLength={80} onChange={e => setF({ ...f, head: e.target.value })} placeholder="Songwriter, designer, superfan" /></label>
          <label className="field"><span>About you</span><textarea value={f.bio} maxLength={280} onChange={e => setF({ ...f, bio: e.target.value })} placeholder="A few words for the community" /></label>
          <div className="acts"><button className="btn p" onClick={async () => { if (await a.saveProfile(f)) clearProfileDraft(f) }}><Icon name="edit" size={16} />Save profile</button><button className="btn" onClick={() => clearProfileDraft(profileBase)}><Icon name="rotate" size={16} />Discard draft</button></div>
        </div>
        <div style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          <div className="glass pad"><div className="stat3"><div><p className="dim">Ideas</p><p className="num">{my.length}</p></div><div><p className="dim">Backings</p><p className="num">{rc}</p></div><div><p className="dim">Communities</p><p className="num">{joined.length}</p></div></div></div>
          <ShareCard title="Your profile link" url={url} sub="Anyone with the link can see your profile." />
          <div className="glass pad"><h3 style={{ marginBottom: 8 }}>Communities</h3>
            {joined.length ? joined.map(c => <div key={c.id} className="row" onClick={() => nav('/communities/' + c.id)}><Icon name="community" /><div className="t"><h3 style={{ fontSize: 15 }}>{c.name}</h3></div></div>) : <><p className="mut">You have not joined any yet.</p><div className="acts"><button className="btn p" onClick={() => nav('/communities')}>Browse communities</button></div></>}</div>
        </div>
      </div>
      <h3 style={{ margin: '34px 0 16px' }}>What you have access to</h3>
      <div className="grid g3" style={{ marginBottom: 18 }}>
        {access.map(([ic, t, d, on]) => <div key={t} className="glass lift acc"><div className="top"><Icon name={ic} size={26} /><span className={on ? 'chip on' : 'chip'}>{on ? 'Available' : 'Owners only'}</span></div><h3>{t}</h3><p className="dim">{d}</p></div>)}
      </div>
      <div className="grid g2"><div className="glass pad"><h3 style={{ marginBottom: 8 }}>Saved ideas</h3>
        {saved.length ? saved.map(i => <div key={i.id} className="row" onClick={() => nav('/idea/' + i.id)}><Icon name="save" /><div className="t"><h3 style={{ fontSize: 15 }}>{i.title}</h3><p className="dim">{a.nm(i.authorId)}</p></div></div>) : <p className="mut" style={{ padding: '14px 0' }}>Save an idea to find it here.</p>}</div>
      <div className="glass pad"><h3 style={{ marginBottom: 8 }}>My contributions</h3>
        {my.length ? my.map(i => <div key={i.id} className="row" onClick={() => nav('/idea/' + i.id)}><div className="score" style={{ width: 44, height: 44 }}><Icon name={a.statusOf(i.id) === 'promoted' ? 'publish' : a.statusOf(i.id) === 'selected' ? 'select' : 'status'} size={18} /></div><div className="t"><h3>{i.title}</h3><p className="dim">{STATUS_LABEL[a.statusOf(i.id)]}, {a.votesOf(i.id)} backing</p></div></div>) : <p className="mut" style={{ padding: '14px 0' }}>You have not shared an idea yet.</p>}</div></div>
      {crop && <CropModal file={crop} onCancel={() => setCrop(null)} onSave={async d => { if (!await a.saveProfile({ photo: d })) return false; setPhotoPreview(d); setCrop(null); return true }} />}
    </>
  )
}

function Public({ id }: { id: string }) {
  const a = useApp()
  const nav = useNavigate()
  const q = a.data.profiles[id]
  const my = a.data.ideas.filter(i => i.authorId === id).sort((x, y) => y.at - x.at)
  const rc = my.reduce((n, i) => n + a.votesOf(i.id), 0)
  const jc = a.data.communities.filter(c => a.data.members[id]?.[c.id])
  return (
    <>
      <div className="head"><div><button className="chip" onClick={() => nav(-1)}>Back</button></div>{id === a.me?.id && <button className="btn" onClick={() => nav('/me')}><Icon name="edit" size={16} />Edit profile</button>}</div>
      <div className="glass pad">
        <div className="pw"><span className="avx" style={{ width: 112, height: 112 }}><Av id={id} size={112} /></span>
          <div style={{ minWidth: 0 }}><h2 style={{ fontSize: 'clamp(28px,4vw,40px)' }}>{a.nm(id)}</h2>{q?.head && <p className="mut" style={{ marginTop: 6 }}>{q.head}</p>}{q?.bio && <p style={{ marginTop: 14, maxWidth: 560, whiteSpace: 'pre-wrap' }}>{q.bio}</p>}</div></div>
        <div className="stat3" style={{ marginTop: 28 }}><div><p className="dim">Ideas</p><p className="num">{my.length}</p></div><div><p className="dim">Backings</p><p className="num">{rc}</p></div><div><p className="dim">Communities</p><p className="num">{jc.length}</p></div></div>
      </div>
      <ShareCard title="Profile link" url={location.origin + '/me/' + id} sub="Scan or open to view this profile." />
      <h3 style={{ margin: '30px 0 14px' }}>Ideas</h3>
      {my.length ? <div className="grid g3">{my.map(i => <IdeaCard key={i.id} idea={i} />)}</div> : <Empty icon="idea" title="No ideas yet" text="Ideas this person shares will appear here." />}
    </>
  )
}
