import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Gate } from '../components/Gate'
import { EmojiPicker } from '../components/Emoji'
import { Av, Chip, Empty, Head } from '../components/ui'
import { useApp, useComments } from '../data/AppProvider'
import { askJson, streamChat } from '../ai/client'
import { cleanTag, cn, when } from '../lib/util'
import { useDraftState } from '../lib/useDraftState'

export function Promote() {
  return <Gate owner><Inner /></Gate>
}

const LIM: Record<string, number> = { instagram: 2200, x: 280, tiktok: 2200, linkedin: 3000 }

function Inner() {
  const a = useApp()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const pid = sp.get('idea') || ''
  const { data } = a
  const [pm, setPm] = useState({ tone: 'warm', len: 'short', plat: 'instagram', tags: false, emo: false })
  const [draft, setDraft, clearPostDraft] = useDraftState(`q-draft:${a.me?.id}:promote:${pid || 'new'}`, '')
  const [opts, setOpts] = useState<{ label: string; text: string }[]>([])
  const [busy, setBusy] = useState<'' | 'draft' | 'opts' | 'imp' | 'tags'>('')
  const [ht, setHt] = useState<string[]>([])
  const [hs, setHs] = useState<string[]>([])
  const [tagIn, setTagIn] = useState('')
  const [emo, setEmo] = useState(false)
  const [pub, setPub] = useState<string | null>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  const ctl = useRef<AbortController | null>(null)
  const idea = data.ideas.find(i => i.id === pid)
  const comments = useComments(pid || null)
  const selected = data.ideas.filter(i => a.statusOf(i.id) === 'selected')

  const pubs = data.promotions.length ? (
    <div className="glass pad" style={{ margin: '24px auto 0', maxWidth: 760 }}>
      <h3 style={{ marginBottom: 8 }}>Ready to share</h3>
      {data.promotions.map(p => <div key={p.id} className="row" style={{ cursor: 'default', alignItems: 'flex-start' }}><Icon name="publish" /><div className="t"><p style={{ whiteSpace: 'pre-wrap' }}>{p.text}</p><p className="dim" style={{ marginTop: 6 }}>{when(p.at)}</p></div></div>)}
    </div>
  ) : null

  if (pub !== null) {
    return (
      <>
        <Head kicker="Promote" title="Ready to share." />
        <div className="glass pad" style={{ maxWidth: 760, margin: '0 auto' }}><div className="done">
          <div className="score"><Icon name="approve" size={34} /></div><h2>Your post is ready.</h2>
          <p className="mut" style={{ margin: '12px auto 0', maxWidth: 420 }}>Your credited post draft is saved in Quorlyth. Copy it or save it as a file to publish on your social channels.</p>
          <div className="post" style={{ margin: '24px 0', textAlign: 'left', whiteSpace: 'pre-wrap' }}>{pub}</div>
          <div className="acts" style={{ justifyContent: 'center' }}>
            <button className="btn p" onClick={() => navigator.clipboard.writeText(pub).then(() => a.toast('Copied'))}>Copy post</button>
            <button className="btn" onClick={() => { const u = URL.createObjectURL(new Blob([pub], { type: 'text/plain' })); const l = document.createElement('a'); l.href = u; l.download = 'quorlyth-post.txt'; l.click(); URL.revokeObjectURL(u) }}>Save as file</button>
            <button className="btn" onClick={() => { setPub(null); setDraft(''); setSp({}) }}>Done</button>
          </div></div></div>{pubs}
      </>
    )
  }

  if (!idea) {
    return (
      <>
        <Head kicker="Promote" title="Send it to the world." />
        {selected.length ? (
          <div className="glass" style={{ padding: 12, maxWidth: 760, margin: '0 auto' }}>
            <p className="dim" style={{ padding: '12px 16px' }}>Choose a selected idea</p>
            {selected.map(x => <div key={x.id} className="row" onClick={() => setSp({ idea: x.id })}><Av id={x.authorId} size={34} /><div className="t"><h3>{x.title}</h3><p className="dim">{a.nm(x.authorId)}</p></div><Icon name="promote" /></div>)}
          </div>
        ) : <Empty icon="promote" title="Nothing selected yet" text="Select an idea in the review queue and it will appear here."><button className="btn p" style={{ marginTop: 12 }} onClick={() => nav('/queue')}>Open review queue</button></Empty>}
        {pubs}
      </>
    )
  }

  const credits = [...new Set([idea.authorId, ...comments.map(c => c.authorId)])]
  const prompt = (extra = '') => `Write a social media post announcing that a creator is acting on an idea from their fan community. Platform: ${pm.plat}. Tone: ${pm.tone}. Length: ${({ short: 'under 50 words', medium: 'about 80 words', long: 'about 140 words' } as any)[pm.len]}. ${pm.tags ? 'Add 3 to 5 relevant hashtags at the end. ' : 'Use no hashtags. '}${pm.emo ? 'Use a few fitting emojis. ' : 'Use no emojis. '}Credit the community, do not name any individual. Do not invent facts, dates or numbers. ${pm.plat === 'x' ? 'Stay under 280 characters. ' : ''}${extra}\nIdea title: ${idea.title}\nIdea details: ${idea.body || '(none)'}`

  const syncTags = (text: string, tags: string[]) => {
    const t = text.replace(/\s*(?:#[\p{L}\p{N}_]+[ \t]*)+$/u, '')
    return tags.length ? t.replace(/\s+$/, '') + '\n\n' + tags.map(x => '#' + x).join(' ') : t
  }
  const addTags = (s: string) => {
    const next = [...ht]
    s.split(/[\s,]+/).forEach(x => { const c = cleanTag(x); if (c && !next.includes(c) && next.length < 12) next.push(c) })
    setHt(next); setDraft(d => syncTags(d, next)); setTagIn('')
  }
  const removeTag = (t: string) => { const next = ht.filter(x => x !== t); setHt(next); setDraft(d => syncTags(d, next)) }
  const insertEmoji = (e: string) => {
    const el = ta.current; const s = el?.selectionStart ?? draft.length, en = el?.selectionEnd ?? s
    const v = draft.slice(0, s) + e + draft.slice(en); setDraft(v)
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(s + e.length, s + e.length) })
  }
  const stream = async (p: string, kind: 'draft' | 'imp') => {
    setBusy(kind); ctl.current = new AbortController()
    try { const t = await streamChat([{ role: 'user', content: p }], { signal: ctl.current.signal, onText: f => setDraft(f) }); setDraft(t.trim()) }
    catch (e: any) { if (e.name !== 'AbortError') a.toast(e.message || 'Drafting did not finish') }
    setBusy('')
  }
  const sug = (() => {
    const o: string[] = []; const add = (t: string) => { t = cleanTag(t); if (t && !o.includes(t) && !ht.includes(t)) o.push(t) }
    ;(idea.tags || []).forEach(add); add(data.communities.find(c => c.id === idea.cid)?.name || ''); idea.title.split(/\s+/).filter(w => w.length >= 5).slice(0, 3).forEach(add); add('Quorlyth'); hs.forEach(add)
    return o.slice(0, 10)
  })()
  const chs = (k: keyof typeof pm, list: [string, string][]) => list.map(([v, l]) => <Chip key={v} on={pm[k] === v} onClick={() => setPm({ ...pm, [k]: v })}>{l}</Chip>)
  const flipTags = () => {
    const on = !pm.tags
    setPm({ ...pm, tags: on })
    if (on) {
      const add = ht.length ? ht : sug.slice(0, 3)
      setHt(add); setDraft(d => syncTags(d, add)); a.toast(add.length ? 'Hashtags added to your post' : 'Hashtags on')
    } else { setHt([]); setDraft(d => syncTags(d, [])); a.toast('Hashtags removed') }
  }
  const flipEmo = () => { const on = !pm.emo; setPm({ ...pm, emo: on }); setEmo(on); a.toast(on ? 'Emoji picker opened. Tap one to add it.' : 'Emoji picker closed') }
  const tg = (k: 'tags' | 'emo', l: string) => <div className="csr" style={{ padding: '6px 0', border: 0 }}><span className="mut">{l}</span><button className={cn('tg', pm[k] && 'on')} role="switch" aria-checked={pm[k]} aria-label={l} onClick={k === 'tags' ? flipTags : flipEmo}><i /></button></div>
  const lim = LIM[pm.plat]

  return (
    <>
      <Head kicker="Promote" title="Send it to the world." />
      <div className="glass pad" style={{ maxWidth: 760, margin: '0 auto' }}>
        <Chip onClick={() => { setSp({}); setDraft(''); setHt([]); setHs([]); setOpts([]) }}>Choose another</Chip>
        <h3 style={{ margin: '18px 0 6px' }}>{idea.title}</h3>
        <p className="dim" style={{ marginBottom: 20 }}>Write the post your audience will see.</p>
        <div className="aibox">
          <div className="aih"><span className={cn('aiic', busy && 'spin')}><Icon name="spark" size={20} /></span><div><h3 style={{ fontSize: 16 }}>Write with QuorlythBot</h3><p className="dim">Choose a voice, then let it draft.</p></div></div>
          <div className="csr"><span className="mut">Tone</span><div className="acts" style={{ margin: 0, gap: 6 }}>{chs('tone', [['warm', 'Warm'], ['bold', 'Bold'], ['playful', 'Playful'], ['professional', 'Professional']])}</div></div>
          <div className="csr"><span className="mut">Length</span><div className="acts" style={{ margin: 0, gap: 6 }}>{chs('len', [['short', 'Short'], ['medium', 'Medium'], ['long', 'Long']])}</div></div>
          <div className="csr"><span className="mut">Platform</span><div className="acts" style={{ margin: 0, gap: 6 }}>{chs('plat', [['instagram', 'Instagram'], ['x', 'X'], ['tiktok', 'TikTok'], ['linkedin', 'LinkedIn']])}</div></div>
          {tg('tags', 'Add hashtags')}{tg('emo', 'Use emojis')}
          <div className="acts" style={{ marginTop: 12 }}>
            {busy ? <><button className="btn" onClick={() => ctl.current?.abort()}><Icon name="decline" size={16} />Stop</button><span className="dim">QuorlythBot is writing...</span></> : <>
              <button className="btn p" onClick={() => stream(prompt('Return only the post text.'), 'draft')}><span className="aiic"><Icon name="spark" size={16} /></span>Draft with QuorlythBot</button>
              <button className="btn" onClick={async () => { setBusy('opts'); try { const o = await askJson<{ options: any[] }>(prompt('Give three clearly different options. Reply with only JSON: {"options":[{"label":"a short angle name","text":"the post"}]}')); setOpts((o.options || []).slice(0, 3).map(x => ({ label: String(x.label || 'Option'), text: String(x.text || '').trim() })).filter(x => x.text)) } catch (e: any) { a.toast(e.message) } setBusy('') }}><Icon name="rank" size={16} />Give me 3 options</button></>}
          </div>
        </div>
        {opts.length > 0 && <div style={{ marginTop: 18 }}><p className="dim" style={{ marginBottom: 8 }}>Options</p>{opts.map((o, k) => <div key={k} className="row" style={{ alignItems: 'flex-start' }}><div className="t"><p className="dim">{o.label}</p><p style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{o.text}</p></div><button className="btn" style={{ padding: '8px 16px' }} onClick={() => { setDraft(o.text); setHt([]) }}>Use this</button></div>)}</div>}
        <label className="field"><span style={{ display: 'flex', justifyContent: 'space-between' }}><span>Your post</span><span className="dim" style={{ color: draft.length > lim ? '#fff' : undefined, fontWeight: draft.length > lim ? 500 : undefined }}>{draft.length} / {lim}</span></span>
          <textarea ref={ta} value={draft} onChange={e => setDraft(e.target.value)} style={{ minHeight: 170 }} placeholder="Write a post, or let QuorlythBot draft one" /></label>
        <p className="dim" style={{ marginTop: -8 }}>Your edits are saved as a draft on this device. Preparing to share saves a credited copy in Quorlyth; publishing to a social network still happens there.</p>
        <div className="ptools">
          <div className="acts" style={{ margin: '12px 0 0', gap: 8 }}>
            <Chip on={emo} onClick={() => { setEmo(!emo); setPm({ ...pm, emo: !emo }) }}>😊 Emoji</Chip>
            <div className="htin"><span>#</span><input value={tagIn} maxLength={32} placeholder="Add a hashtag" aria-label="Add a hashtag" onChange={e => setTagIn(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); if (tagIn.trim()) addTags(tagIn) } }} /><button className="chip" onClick={() => tagIn.trim() && addTags(tagIn)}>Add</button></div>
            <button className="chip" disabled={!!busy} onClick={async () => { setBusy('tags'); try { const o = await askJson<{ tags: string[] }>(`Suggest 8 short, relevant hashtags for a social post about this idea. Reply with only JSON: {"tags":["one","two"]}. No spaces and no # in the tags.\nPlatform: ${pm.plat}\nIdea title: ${idea.title}\nDetails: ${idea.body || ''}`, { tier: 'quick' }); setHs((o.tags || []).map(cleanTag).filter(Boolean).slice(0, 8)) } catch (e: any) { a.toast(e.message) } setBusy('') }}><span className="aiic"><Icon name="spark" size={13} /></span>Suggest hashtags</button>
          </div>
          {emo && <EmojiPicker onPick={insertEmoji} />}
          {ht.length > 0 && <div className="acts" style={{ margin: '10px 0 0', gap: 6 }}>{ht.map(t => <button key={t} className="chip on" onClick={() => removeTag(t)} aria-label={'Remove #' + t}>#{t} ×</button>)}</div>}
          {sug.length > 0 && <div className="acts" style={{ margin: '8px 0 0', gap: 6, alignItems: 'center' }}><span className="dim" style={{ fontSize: 12 }}>Suggested</span>{sug.map(t => <button key={t} className="chip" onClick={() => addTags(t)}>#{t}</button>)}</div>}
        </div>
        <div className="acts" style={{ marginTop: 12, gap: 8 }}>
          {([['short', 'Shorter', 'Make it noticeably shorter.'], ['punch', 'Punchier', 'Make it punchier and more energetic.'], ['hook', 'Add a hook', 'Add a strong opening hook.'], ['warm', 'Warmer', 'Make it warmer and more personal.'], ['fix', 'Fix grammar', 'Fix spelling and grammar only. Keep the wording.']] as const).map(([k, l, ins]) => (
            <button key={k} className="chip" disabled={!!busy} onClick={() => draft.trim() ? stream(`Rewrite this social post. ${ins} Keep the meaning, do not add new facts, keep it suitable for ${pm.plat}. Return only the rewritten post.\n\n${draft}`, 'imp') : a.toast('Write or draft something first')}><Icon name="spark" size={13} />{l}</button>
          ))}
        </div>
        <div className="reason" style={{ marginTop: 24 }}><span className="dim">Credited</span><div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{credits.slice(0, 8).map(c => <Av key={c} id={c} size={28} />)}<span className="dim">{credits.slice(0, 4).map(a.nm).join(', ')}{credits.length > 4 ? ` and ${credits.length - 4} more` : ''}</span></div></div>
        <div className="acts"><button className="btn p" onClick={async () => { if (!draft.trim()) return a.toast('Write the post first'); const post = draft.trim(); if (await a.publish(idea.id, post, credits)) { clearPostDraft(''); setPub(post) } }}><Icon name="publish" />Prepare to share</button><button className="btn" onClick={() => clearPostDraft('')}>Discard draft</button></div>
      </div>
      {pubs}
    </>
  )
}
