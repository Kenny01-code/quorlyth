import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Gate } from '../components/Gate'
import { EmojiPicker } from '../components/Emoji'
import { Av, Chip, Empty, Head } from '../components/ui'
import { PromotionPreview } from '../components/PromotionPreview'
import { SocialBrandIcon } from '../components/SocialBrandIcon'
import { SocialPublishingPanel } from '../components/SocialPublishingPanel'
import { useApp, useComments } from '../data/AppProvider'
import { askJson, streamChat } from '../ai/client'
import { cleanTag, cn, when } from '../lib/util'
import { useDraftState } from '../lib/useDraftState'
import { openSocialShare } from '../lib/socialShare'
import type { SocialPromotionPlatform } from '../lib/types'
import type { SocialShareTarget } from '../lib/socialShare'
import '../styles/social-sharing.css'
import '../styles/promotion-studio.css'

export function Promote() {
  return <Gate owner><Inner /></Gate>
}

const LIM: Record<string, number> = { instagram: 2200, x: 280, tiktok: 2200, linkedin: 3000, facebook: 5000, threads: 500, bluesky: 300, reddit: 10000, whatsapp: 4096, telegram: 4096, youtube: 5000 }

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
  const [preparingPost, setPreparingPost] = useState(false)
  const [activeStep, setActiveStep] = useState<'content' | 'audience' | 'distribution' | 'review' | null>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  const ctl = useRef<AbortController | null>(null)
  const managedCommunityIds = new Set(data.communities.filter(c => a.ownsCommunity(c.id)).map(c => c.id))
  const visibleIdeas = data.ideas.filter(i => a.owner || managedCommunityIds.has(i.cid))
  const visibleIdeaIds = new Set(visibleIdeas.map(i => i.id))
  const idea = visibleIdeas.find(i => i.id === pid)
  const comments = useComments(idea ? pid : null)
  const selected = visibleIdeas.filter(i => a.statusOf(i.id) === 'selected')
  const visiblePromotions = data.promotions.filter(p => visibleIdeaIds.has(p.ideaId))

  const pubs = visiblePromotions.length ? (
    <section className="promotion-library" style={{ margin: '24px auto 0', maxWidth: 980 }}>
      <div className="head"><div><p className="dim">PROMOTION HISTORY</p><h3>Ready to share</h3></div><span className="chip">{visiblePromotions.length} saved</span></div>
      <div className="promotion-library-list">
        {visiblePromotions.map(p => {
          const sourceIdea = visibleIdeas.find(item => item.id === p.ideaId)
          return sourceIdea
            ? <PromotionPreview key={p.id} idea={sourceIdea} promotion={p} compact />
            : <div key={p.id} className="glass pad"><p className="dim">Original idea unavailable</p><p className="promotion-post-copy q-writeup" style={{ marginTop: 8 }}>{p.text}</p><p className="dim" style={{ marginTop: 8 }}>{when(p.at)}</p></div>
        })}
      </div>
    </section>
  ) : null

  const sourceIdeaUrl = idea ? window.location.origin + '/idea/' + idea.id : window.location.origin + '/promote'
  const shareTargets: { id: SocialShareTarget; label: string }[] = [
    { id: 'x', label: 'X' }, { id: 'facebook', label: 'Facebook' }, { id: 'linkedin', label: 'LinkedIn' },
    { id: 'threads', label: 'Threads' }, { id: 'bluesky', label: 'Bluesky' }, { id: 'reddit', label: 'Reddit' },
    { id: 'whatsapp', label: 'WhatsApp' }, { id: 'telegram', label: 'Telegram' },
  ]
  const copyAndOpenCreator = (network: 'instagram' | 'tiktok' | 'youtube') => {
    const destination = network === 'instagram' ? 'https://www.instagram.com/' : network === 'tiktok' ? 'https://www.tiktok.com/' : 'https://studio.youtube.com/'
    window.open(destination, '_blank', 'noopener,noreferrer')
    void navigator.clipboard.writeText((pub || '') + '\n\n' + sourceIdeaUrl).then(() => a.toast('Caption and source idea link copied. Paste them into ' + (network === 'youtube' ? 'YouTube Studio' : network === 'instagram' ? 'Instagram' : 'TikTok') + ' to finish your post.')).catch(() => a.toast('Could not copy the caption. You can still copy it from the post above.'))
  }
  const openShareTarget = (target: SocialShareTarget) => {
    if (target === 'linkedin') {
      openSocialShare('linkedin', pub || '', sourceIdeaUrl, 'A post from Quorlyth')
      void navigator.clipboard.writeText((pub || '') + '\n\n' + sourceIdeaUrl).then(() => a.toast('Caption and source link copied. Paste them into your LinkedIn post.')).catch(() => a.toast('LinkedIn opened. Copy the caption from the post above.'))
      return
    }
    openSocialShare(target, pub || '', sourceIdeaUrl, 'A post from Quorlyth')
  }
  const shareNative = () => {
    if (typeof navigator.share === 'function') {
      void navigator.share({ title: 'A post from Quorlyth', text: pub || '', url: sourceIdeaUrl }).catch(error => { if (error?.name !== 'AbortError') a.toast('Your device could not open the share sheet. Choose a network below.') })
      return
    }
    void navigator.clipboard.writeText(pub || '').then(() => a.toast('Post copied. Paste it into your social app.')).catch(() => a.toast('Could not copy the post.'))
  }

  if (pub !== null) {
    return (
      <>
        <Head kicker="Promote" title="Ready to share." />
        <div className="glass pad" style={{ maxWidth: 760, margin: '0 auto' }}><div className="done">
          <div className="score"><Icon name="approve" size={34} /></div><h2>Your post is ready.</h2>
          <p className="mut" style={{ margin: '12px auto 0', maxWidth: 420 }}>Your credited post draft is saved in Quorlyth. You can publish directly to a connected account or use the share options below.</p>
          <div className="post q-writeup" style={{ margin: '24px 0', textAlign: 'left', whiteSpace: 'pre-wrap' }}>{pub}</div>
          <div className="acts" style={{ justifyContent: 'center' }}>
            <button className="btn p" onClick={() => navigator.clipboard.writeText(pub).then(() => a.toast('Copied'))}>Copy post</button>
            <button className="btn" onClick={() => { const u = URL.createObjectURL(new Blob([pub], { type: 'text/plain' })); const l = document.createElement('a'); l.href = u; l.download = 'quorlyth-post.txt'; l.click(); URL.revokeObjectURL(u) }}>Save as file</button>
            <button className="btn" onClick={() => { setPub(null); setDraft(''); setSp({}) }}>Done</button>
          </div></div>
        <section className="q-social-share-block">
          <div className="q-social-share-heading">
            <div><p className="ql-eyebrow">PUBLISH FROM YOUR CHANNEL</p><h3>Share this post</h3><p>Use a connected channel to publish this caption from Quorlyth, or open a network's own sharing surface.</p></div>
            <button type="button" className="btn p q-social-native-share" onClick={shareNative}><Icon name="share" size={15} />Share</button>
          </div>
          <div className="q-social-share-grid">
            {shareTargets.map(target => <button key={target.id} type="button" className="q-social-share-target" onClick={() => openShareTarget(target.id)}><span className="q-social-share-mark"><SocialBrandIcon name={target.id} /></span><span>{target.label}</span><Icon name="arrow-up-right" size={13} /></button>)}
          </div>
          <div className="q-social-share-manual">
            <p className="dim">For networks that require you to finish the post in their app:</p>
            <button type="button" className="btn" onClick={() => copyAndOpenCreator('instagram')}><SocialBrandIcon name="instagram" />Copy for Instagram <Icon name="arrow-up-right" size={13} /></button>
            <button type="button" className="btn" onClick={() => copyAndOpenCreator('tiktok')}><SocialBrandIcon name="tiktok" />Copy for TikTok <Icon name="arrow-up-right" size={13} /></button>
            <button type="button" className="btn" onClick={() => copyAndOpenCreator('youtube')}><SocialBrandIcon name="youtube" />Copy for YouTube <Icon name="arrow-up-right" size={13} /></button>
          </div>
          <p className="q-social-share-footnote">Share links and copy workflows remain available even when a provider account is not connected.</p>
        </section>
        <SocialPublishingPanel text={pub} link={sourceIdeaUrl} preferredPlatform={pm.plat} />
        </div>{pubs}
      </>
    )
  }

  if (!idea) {
    return (
      <>
        <header className="q-promo-page-head">
          <div><p className="ql-eyebrow">PROMOTE AN IDEA</p><h1>Make your idea travel.</h1><p>Write, preview and save a credited post before choosing where to share it.</p></div>
          <span className="q-promo-page-step">01 <i /> CONTENT STUDIO</span>
        </header>
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
  const workflowSteps = [
    { id: 'content', target: 'q-promo-content', number: '1', title: 'Content', detail: 'Write your post' },
    { id: 'audience', target: 'q-promo-audience', number: '2', title: 'Audience', detail: 'Community & credit' },
    { id: 'distribution', target: 'q-promo-distribution', number: '3', title: 'Distribution', detail: 'Choose a channel' },
    { id: 'review', target: 'q-promo-review', number: '4', title: 'Review', detail: 'Preview before sharing' },
  ] as const
  const prompt = (extra = '') => `Write a social media post announcing that a creator is acting on an idea from their fan community. Platform: ${pm.plat}. Maximum length: ${LIM[pm.plat as SocialPromotionPlatform]} characters. Tone: ${pm.tone}. Length: ${({ short: 'under 50 words', medium: 'about 80 words', long: 'about 140 words' } as any)[pm.len]}. ${pm.tags ? 'Add 3 to 5 relevant hashtags at the end. ' : 'Use no hashtags. '}${pm.emo ? 'Use a few fitting emojis. ' : 'Use no emojis. '}Credit the community, do not name any individual. Do not invent facts, dates or numbers. ${pm.plat === 'x' ? 'Stay under 280 characters. ' : ''}${extra}\nIdea title: ${idea.title}\nIdea details: ${idea.body || '(none)'}`

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
    if (busy || preparingPost) return
    setBusy(kind)
    ctl.current = new AbortController()
    try {
      const text = await streamChat([{ role: 'user', content: p }], { signal: ctl.current.signal, onText: fragment => setDraft(fragment) })
      setDraft(text.trim())
    } catch (error: any) {
      if (error?.name !== 'AbortError') a.toast(error?.message || 'Drafting did not finish. Try again.')
    } finally {
      setBusy('')
      ctl.current = null
    }
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
      <header className="q-promo-page-head">
        <div><p className="ql-eyebrow">IDEA PROMOTION</p><h1>Build your share-ready post.</h1><p>Turn this community idea into a credited post, preview it, and choose a supported destination.</p></div>
        <span className="q-promo-page-step">01 <i /> CONTENT STUDIO</span>
      </header>
      <div className="q-promo-studio">
        <aside className="q-promo-rail" aria-label="Promotion workflow">
          <div className="q-promo-rail-head">
            <p className="ql-eyebrow">PROMOTION STUDIO</p>
            <h3>Make it travel.</h3>
            <p>Prepare a clear, credited story for your community idea.</p>
          </div>
          <nav className="q-promo-steps" aria-label="Promotion steps">
            {workflowSteps.map(step => <a
              key={step.id}
              className={activeStep === step.id ? 'is-current' : undefined}
              href={'#' + step.target}
              aria-current={activeStep === step.id ? 'step' : undefined}
              onClick={() => setActiveStep(step.id)}
            ><span>{step.number}</span><span><b>{step.title}</b><small>{step.detail}</small></span></a>)}
          </nav>
          <div id="q-promo-audience" className="q-promo-audience">
            <span className="q-promo-audience-mark"><Icon name="community" size={17} /></span>
            <div><p className="ql-eyebrow">AUDIENCE</p><strong>{data.communities.find(item => item.id === idea.cid)?.name || 'Your community'}</strong><small>Source idea · {a.nm(idea.authorId)}</small></div>
          </div>
          <div className="q-promo-save-state" role="status"><Icon name="approve" size={15} /><span>Autosaved on this device</span></div>
        </aside>
        <div id="q-promo-content" className="glass pad q-promo-compose">
        <Chip onClick={() => { setSp({}); setDraft(''); setHt([]); setHs([]); setOpts([]) }}>Choose another</Chip>
        <h3 style={{ margin: '18px 0 6px' }}>{idea.title}</h3>
        <p className="dim" style={{ marginBottom: 20 }}>Write the post your audience will see.</p>
        <div className="aibox">
          <div className="aih"><span className={cn('aiic', busy && 'spin')}><Icon name="spark" size={20} /></span><div><h3 style={{ fontSize: 16 }}>Write with QuorlythBot</h3><p className="dim">Choose a voice, then let it draft.</p></div></div>
          <div className="csr"><span className="mut">Tone</span><div className="acts" style={{ margin: 0, gap: 6 }}>{chs('tone', [['warm', 'Warm'], ['bold', 'Bold'], ['playful', 'Playful'], ['professional', 'Professional']])}</div></div>
          <div className="csr"><span className="mut">Length</span><div className="acts" style={{ margin: 0, gap: 6 }}>{chs('len', [['short', 'Short'], ['medium', 'Medium'], ['long', 'Long']])}</div></div>
          <div className="csr q-social-platform-row"><span className="mut">Platform</span><div className="acts q-social-platforms" style={{ margin: 0, gap: 6 }}>{chs('plat', [['instagram', 'Instagram'], ['x', 'X'], ['tiktok', 'TikTok'], ['linkedin', 'LinkedIn'], ['facebook', 'Facebook'], ['threads', 'Threads'], ['bluesky', 'Bluesky'], ['reddit', 'Reddit'], ['whatsapp', 'WhatsApp'], ['telegram', 'Telegram'], ['youtube', 'YouTube']])}</div></div>
          {tg('tags', 'Add hashtags')}{tg('emo', 'Use emojis')}
          <div className="acts" style={{ marginTop: 12 }}>
            {busy ? <><button className="btn" onClick={() => ctl.current?.abort()}><Icon name="decline" size={16} />Stop</button><span className="dim">QuorlythBot is writing...</span></> : <>
              <button className="btn p" onClick={() => stream(prompt('Return only the post text.'), 'draft')}><span className="aiic"><Icon name="spark" size={16} /></span>Draft with QuorlythBot</button>
              <button type="button" className="btn" disabled={!!busy || preparingPost} onClick={async () => {
                if (busy || preparingPost) return
                setBusy('opts')
                try {
                  const options = await askJson<{ options: any[] }>(prompt('Give three clearly different options. Reply with only JSON: {"options":[{"label":"a short angle name","text":"the post"}]}'))
                  setOpts((options.options || []).slice(0, 3).map(option => ({ label: String(option.label || 'Option'), text: String(option.text || '').trim() })).filter(option => option.text))
                } catch (error: any) {
                  a.toast(error?.message || 'Could not prepare post options. Try again.')
                } finally {
                  setBusy('')
                }
              }}><Icon name="rank" size={16} />Give me 3 options</button></>}
          </div>
        </div>
        {opts.length > 0 && <div style={{ marginTop: 18 }}><p className="dim" style={{ marginBottom: 8 }}>Options</p>{opts.map((o, k) => <div key={k} className="row" style={{ alignItems: 'flex-start' }}><div className="t"><p className="dim">{o.label}</p><p className="q-writeup" style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{o.text}</p></div><button className="btn" style={{ padding: '8px 16px' }} onClick={() => { setDraft(o.text); setHt([]) }}>Use this</button></div>)}</div>}
        <label className="field"><span style={{ display: 'flex', justifyContent: 'space-between' }}><span>Your post</span><span className="dim" style={{ color: draft.length > lim ? '#fff' : undefined, fontWeight: draft.length > lim ? 500 : undefined }}>{draft.length} / {lim}</span></span>
          <textarea ref={ta} value={draft} onChange={e => setDraft(e.target.value)} style={{ minHeight: 170 }} placeholder="Write a post, or let QuorlythBot draft one" /></label>
        <p className="dim" style={{ marginTop: -8 }}>Edits autosave on this device. Save a credited draft to Quorlyth before reviewing sharing options; external publishing only happens after you confirm a supported destination.</p>
        <div className="ptools">
          <div className="acts" style={{ margin: '12px 0 0', gap: 8 }}>
            <Chip on={emo} onClick={() => { setEmo(!emo); setPm({ ...pm, emo: !emo }) }}>😊 Emoji</Chip>
            <div className="htin"><span>#</span><input value={tagIn} maxLength={32} placeholder="Add a hashtag" aria-label="Add a hashtag" onChange={e => setTagIn(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); if (tagIn.trim()) addTags(tagIn) } }} /><button className="chip" onClick={() => tagIn.trim() && addTags(tagIn)}>Add</button></div>
            <button type="button" className="chip" disabled={!!busy || preparingPost} onClick={async () => {
              if (busy || preparingPost) return
              setBusy('tags')
              try {
                const result = await askJson<{ tags: string[] }>(`Suggest 8 short, relevant hashtags for a social post about this idea. Reply with only JSON: {"tags":["one","two"]}. No spaces and no # in the tags.\nPlatform: ${pm.plat}\nIdea title: ${idea.title}\nDetails: ${idea.body || ''}`, { tier: 'quick' })
                setHs((result.tags || []).map(cleanTag).filter(Boolean).slice(0, 8))
              } catch (error: any) {
                a.toast(error?.message || 'Could not suggest hashtags. Try again.')
              } finally {
                setBusy('')
              }
            }}><span className="aiic"><Icon name="spark" size={13} /></span>Suggest hashtags</button>
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
        <div className="acts"><button type="button" className="btn p" disabled={preparingPost || !!busy || !draft.trim() || draft.trim().length > lim} onClick={async () => {
          if (preparingPost || busy) return
          const post = draft.trim()
          if (!post) return a.toast('Write the post first')
          if (post.length > lim) return a.toast('This post is over the ' + lim + '-character limit for ' + pm.plat + '. Shorten it before preparing to share.')
          setPreparingPost(true)
          try {
            if (await a.publish(idea.id, post, credits, pm.plat as SocialPromotionPlatform)) {
              clearPostDraft('')
              setPub(post)
            }
          } catch (error) {
            a.toast(error instanceof Error ? error.message : 'Could not prepare this post. Please try again.')
          } finally {
            setPreparingPost(false)
          }
        }}><Icon name="publish" />{preparingPost ? 'Saving…' : 'Save draft & continue'}</button><button type="button" className="btn" disabled={preparingPost} onClick={() => clearPostDraft('')}>Discard draft</button></div>
        </div>
        <aside className="q-promo-side">
          <section id="q-promo-review" className="q-promo-live-preview" aria-live="polite" aria-label="Quorlyth idea feed preview">
            <div className="q-promo-preview-top"><div className="q-promo-brand-mark"><Icon name="spark" size={16} /></div><div><strong>Quorlyth</strong><small>Idea feed preview</small></div><span className="q-promo-preview-platform">Quorlyth</span></div>
            <div className="q-promo-preview-copy">
              <p className="q-promo-preview-idea">{idea.title}</p>
              <p className="q-writeup">{draft.trim() || 'Your post preview will appear here as you write.'}</p>
              {ht.length > 0 && <div className="q-promo-preview-tags">{ht.map(tag => <span key={tag}>#{tag}</span>)}</div>}
            </div>
            <div className="q-promo-preview-footer"><span><Icon name="community" size={16} /> Community idea</span><span><Icon name="edit" size={16} /> Draft preview</span></div>
            <div className="q-promo-preview-credit">Credited to {credits.slice(0, 3).map(a.nm).join(', ')}{credits.length > 3 ? ` +${credits.length - 3}` : ''}</div>
          </section>
          <section className="q-promo-engagement" aria-label="Available community activity">
            <div className="q-promo-engagement-heading"><p className="ql-eyebrow">COMMUNITY ACTIVITY</p><span>Quorlyth data</span></div>
            <div className="q-promo-engagement-stats">
              <div><strong>{comments.length.toLocaleString()}</strong><span>{comments.length === 1 ? 'comment' : 'comments'}</span></div>
              <div><strong>{credits.length.toLocaleString()}</strong><span>{credits.length === 1 ? 'contributor' : 'contributors'}</span></div>
            </div>
            <div className="q-promo-engagement-people" aria-label="Idea author and discussion contributors">
              {credits.slice(0, 6).map(userId => <span key={userId} title={a.nm(userId)}><Av id={userId} size={27} /></span>)}
              {credits.length > 6 && <span className="q-promo-engagement-more">+{credits.length - 6}</span>}
              <p>{credits.slice(0, 4).map(a.nm).join(', ')}{credits.length > 4 ? ` and ${credits.length - 4} more` : ''}</p>
            </div>
            <p className="q-promo-engagement-note">Views, likes and shares are not currently measured for Quorlyth ideas.</p>
          </section>
          <section id="q-promo-distribution" className="q-promo-distribution">
            <div className="q-promo-distribution-heading"><div><p className="ql-eyebrow">DISTRIBUTION</p><h3>Publishing destinations</h3></div><span>After saving</span></div>
            <p className="q-promo-channel-intro">Save your credited Quorlyth draft first. Then review it and publish only to connected accounts the app supports.</p>
            <div className="q-promo-channels" aria-label="Supported direct-publishing destinations">
              {([
                { id: 'x', label: 'X' },
                { id: 'linkedin', label: 'LinkedIn' },
                { id: 'facebook', label: 'Facebook Pages' },
                { id: 'instagram', label: 'Instagram' },
                { id: 'pinterest', label: 'Pinterest' },
              ] as const).map(channel => <span key={channel.id} title={channel.label}><SocialBrandIcon name={channel.id} /><span>{channel.label}</span></span>)}
            </div>
            <p className="q-promo-channel-note">These are supported direct-publishing platforms, not a connection-status list. Connected accounts appear after saving. Other destinations use share handoffs. Instagram and Pinterest require a public HTTPS image URL.</p>
          </section>
        </aside>
      </div>
      {pubs}
    </>
  )
}
