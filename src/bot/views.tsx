import { RefObject, useState } from 'react'
import { Icon } from '../lib/Icon'
import { Chip } from '../components/ui'
import { useApp } from '../data/AppProvider'
import { cn, slug, when } from '../lib/util'
import { speakText } from '../ai/client'
import { RobotApi } from './Robot'
import { SKILLS, THEMES, VOICES } from './config'
import { useBotData } from './useBotData'

interface P {
  view: string; bd: ReturnType<typeof useBotData>; role: string; skill: (id: string) => void
  pj: string; setPj: (id: string) => void; theme: string; robot: RefObject<RobotApi | null>
  stage: string; setStage: (s: any) => void; mode: string; setMode: (m: any) => void
}

function Tgl({ on, label, desc, onClick }: { on: boolean; label: string; desc?: string; onClick: () => void }) {
  return <div className="csr"><span><b style={{ fontWeight: 400 }}>{label}</b>{desc && <><br /><span className="dim">{desc}</span></>}</span><button className={cn('tg', on && 'on')} role="switch" aria-checked={on} aria-label={label} onClick={onClick}><i /></button></div>
}
function Chips({ label, desc, value, list, onPick }: { label: string; desc?: string; value: string; list: [string, string][]; onPick: (v: string) => void }) {
  return <div className="csr" style={{ alignItems: 'flex-start' }}><span><b style={{ fontWeight: 400 }}>{label}</b>{desc && <><br /><span className="dim">{desc}</span></>}</span><div className="acts" style={{ margin: 0, gap: 6, justifyContent: 'flex-end' }}>{list.map(([v, l]) => <Chip key={v} on={value === v} onClick={() => onPick(v)}>{l}</Chip>)}</div></div>
}

export function BotViews(p: P) {
  const a = useApp()
  const { bd } = p
  const s = bd.settings
  const [pf, setPf] = useState<{ id?: string; name: string; ins: string; cid: string }>({ name: '', ins: '', cid: '' })
  const [about, setAbout] = useState(s.about)
  const [sample, setSample] = useState('Hi, I am QuorlythBot. This is how I sound when we talk.')
  const [del, setDel] = useState('')
  const [vm, setVm] = useState<{ state: 'idle' | 'rec' | 'done' | 'err'; msg: string }>({ state: 'idle', msg: '' })

  async function matchVoice() {
    setVm({ state: 'rec', msg: '' })
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const ac = new (window.AudioContext || (window as any).webkitAudioContext)()
      const an = ac.createAnalyser(); an.fftSize = 2048; ac.createMediaStreamSource(st).connect(an)
      const buf = new Float32Array(an.fftSize), f: number[] = []
      const timer = setInterval(() => {
        an.getFloatTimeDomainData(buf)
        let rms = 0; for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i]
        if (Math.sqrt(rms / buf.length) < 0.012) return
        let best = -1, bc = 0
        for (let lag = Math.floor(ac.sampleRate / 400); lag <= Math.floor(ac.sampleRate / 70); lag++) { let c = 0; for (let i = 0; i < buf.length - lag; i += 2) c += buf[i] * buf[i + lag]; if (c > bc) { bc = c; best = lag } }
        const hz = best > 0 ? ac.sampleRate / best : -1
        if (hz > 70 && hz < 400) f.push(hz)
      }, 90)
      await new Promise(r => setTimeout(r, 5200))
      clearInterval(timer); st.getTracks().forEach(t => t.stop()); ac.close()
      if (f.length < 8) return setVm({ state: 'err', msg: 'I did not hear enough. Try again a little closer to the microphone.' })
      f.sort((x, y) => x - y)
      const m = f[Math.floor(f.length / 2)], g = m < 165 ? 'm' : 'f', v = VOICES.find(x => x.g === g)!
      bd.saveSettings({ vid: v.id, theme: v.theme }); p.robot.current?.theme(v.theme); p.robot.current?.spin()
      setVm({ state: 'done', msg: `Your voice sits around ${Math.round(m)} Hz. I chose ${v.n} to feel close to yours.` })
      speakText(`Hi, I am ${v.n}. I tuned myself to sound like you.`, v.ai, () => p.robot.current?.talk(true), () => p.robot.current?.talk(false)).catch(() => {})
    } catch (e: any) { setVm({ state: 'err', msg: /NotAllowed|Permission/i.test(e.name + e.message) ? 'The microphone is blocked. Allow it in your browser settings.' : 'The microphone could not start.' }) }
  }

  if (p.view === 'skills') return (
    <><h3 className="bvt">Skills</h3><p className="mut" style={{ margin: '6px 0 18px' }}>Things I can do for your space. Pick one, or type / in any chat.</p>
      <div className="bgrid">{SKILLS.filter(k => a.owner || !k.own).map(k => <button key={k.id} className="bsk" onClick={() => p.skill(k.id)}><span className="bski"><Icon name={k.icon} size={22} /></span><b>{k.n}</b><span className="dim">{k.d}</span></button>)}</div></>
  )

  if (p.view === 'projects') return (
    <><h3 className="bvt">Projects</h3><p className="mut" style={{ margin: '6px 0 18px' }}>A project holds standing instructions and a community, so every chat in it starts informed.</p>
      {bd.projects.length ? bd.projects.map(x => (
        <div key={x.id} className="glass pad" style={{ marginBottom: 12, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}><h3 style={{ fontSize: 16 }}>{x.name}</h3><p className="dim">{a.data.communities.find(c => c.id === x.cid)?.name || 'No community linked'}</p></div>
            <div className="acts" style={{ margin: 0, gap: 6 }}>
              <Chip on={p.pj === x.id} onClick={() => p.setPj(p.pj === x.id ? '' : x.id)}>{p.pj === x.id ? 'Active' : 'Use'}</Chip>
              <Chip onClick={() => setPf({ id: x.id, name: x.name, ins: x.ins || '', cid: x.cid || '' })}>Edit</Chip>
              <Chip onClick={() => { if (del !== x.id) return setDel(x.id); bd.remove(x.id); if (p.pj === x.id) p.setPj('') }}>{del === x.id ? 'Confirm' : 'Delete'}</Chip>
            </div>
          </div>
          {x.ins && <p className="mut" style={{ marginTop: 10, whiteSpace: 'pre-wrap', fontSize: 13 }}>{x.ins.slice(0, 200)}</p>}
        </div>
      )) : <p className="mut" style={{ marginBottom: 18 }}>No projects yet.</p>}
      <div className="glass pad" style={{ padding: 18 }}>
        <h3 style={{ fontSize: 16 }}>{pf.id ? 'Edit project' : 'New project'}</h3>
        <label className="field"><span>Name</span><input value={pf.name} maxLength={50} onChange={e => setPf({ ...pf, name: e.target.value })} placeholder="For example, Launch week" /></label>
        <label className="field"><span>Instructions</span><textarea value={pf.ins} maxLength={800} onChange={e => setPf({ ...pf, ins: e.target.value })} placeholder="How should I help in this project?" /></label>
        <div className="field"><span>Community</span><div className="acts" style={{ margin: 0, gap: 6 }}><Chip on={!pf.cid} onClick={() => setPf({ ...pf, cid: '' })}>None</Chip>{a.data.communities.map(c => <Chip key={c.id} on={pf.cid === c.id} onClick={() => setPf({ ...pf, cid: c.id })}>{c.name}</Chip>)}</div></div>
        <div className="acts"><button className="btn p" onClick={() => { if (!pf.name.trim()) return a.toast('Name your project'); bd.put(pf.id || 'p_' + slug(), { name: pf.name.trim(), ins: pf.ins.trim(), cid: pf.cid, at: Date.now() }); setPf({ name: '', ins: '', cid: '' }); a.toast('Project saved') }}>{pf.id ? 'Save project' : 'Create project'}</button>{pf.id && <button className="btn" onClick={() => setPf({ name: '', ins: '', cid: '' })}>Cancel</button>}</div>
      </div></>
  )

  if (p.view === 'library') return (
    <><h3 className="bvt">Library</h3><p className="mut" style={{ margin: '6px 0 18px' }}>Replies you saved. Copy them, or keep them for later.</p>
      {bd.library.length ? bd.library.map(x => (
        <div key={x.id} className="glass pad" style={{ marginBottom: 12, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><h3 style={{ fontSize: 15, minWidth: 0 }}>{x.title}</h3><span className="dim">{when(x.at)}</span></div>
          <p className="mut" style={{ margin: '8px 0 12px', whiteSpace: 'pre-wrap' }}>{x.text.slice(0, 420)}</p>
          <div className="acts" style={{ margin: 0, gap: 6 }}><Chip onClick={() => navigator.clipboard.writeText(x.text).then(() => a.toast('Copied'))}><Icon name="copy" size={13} />Copy</Chip><Chip onClick={() => bd.remove(x.id)}><Icon name="trash" size={13} />Delete</Chip></div>
        </div>
      )) : <div className="glass cent"><Icon name="book" /><h3>Nothing saved yet</h3><p className="mut">Tap the star under any reply to keep it here.</p></div>}</>
  )

  if (p.view === 'custom') return (
    <><h3 className="bvt">Customize</h3><p className="mut" style={{ margin: '6px 0 14px' }}>Make QuorlythBot yours. Saved privately to your account.</p>
      <div className="glass pad" style={{ padding: '6px 18px', marginBottom: 14 }}>
        <Chips label="Tone" value={s.tone} onPick={v => bd.saveSettings({ tone: v })} list={[['warm', 'Warm'], ['concise', 'Concise'], ['playful', 'Playful'], ['professional', 'Professional']]} />
        <Chips label="Length" value={s.len} onPick={v => bd.saveSettings({ len: v })} list={[['short', 'Short'], ['medium', 'Medium'], ['long', 'Detailed']]} />
        <Tgl on={s.emo} label="Emojis" desc="Allow a few in replies" onClick={() => bd.saveSettings({ emo: !s.emo })} />
      </div>
      <div className="glass pad" style={{ padding: 18, marginBottom: 14 }}><h3 style={{ fontSize: 15 }}>About you</h3><p className="dim" style={{ margin: '4px 0 10px' }}>Anything I should always know, such as your style, audience or goals.</p>
        <textarea value={about} maxLength={500} onChange={e => setAbout(e.target.value)} placeholder="For example, I make bold, minimal music and want warm, short replies." /><div className="acts" style={{ marginTop: 12 }}><button className="btn p" onClick={() => { bd.saveSettings({ about: about.trim() }); a.toast('Saved') }}>Save</button></div></div>
      <div className="glass pad" style={{ padding: '6px 18px' }}>
        <Tgl on={s.voice} label="Voice" desc="I speak my replies aloud" onClick={() => bd.saveSettings({ voice: !s.voice })} />
        <Tgl on={s.robot} label="Show the robot" desc="The 3D character above the chat" onClick={() => bd.saveSettings({ robot: !s.robot })} />
        <Tgl on={s.calm} label="Calm gestures" desc="Fewer hand movements while speaking" onClick={() => bd.saveSettings({ calm: !s.calm })} />
      </div></>
  )

  if (p.view === 'voice') {
    const cur = VOICES.find(v => v.id === s.vid) || VOICES[0]
    const pick = (v: typeof VOICES[number]) => { bd.saveSettings({ vid: v.id, theme: v.theme }); p.robot.current?.theme(v.theme); p.robot.current?.spin(); speakText('Hi, I am ' + v.n + '. ' + v.d + ', and ready when you are.', v.ai, () => p.robot.current?.talk(true), () => p.robot.current?.talk(false)).catch(() => {}) }
    return (
      <><h3 className="bvt">Voice studio</h3><p className="mut" style={{ margin: '6px 0 4px' }}>Choose how QuorlythBot sounds and looks. Drag the robot above to turn it all the way round.</p>
        <div className="bvgrid">{VOICES.map(v => { const T = (THEMES as any)[v.theme]; return (
          <button key={v.id} className={cn('bvc', cur.id === v.id && 'on')} style={{ ['--c1' as any]: T.g1, ['--c2' as any]: T.g2, ['--cr' as any]: T.cr } as any} aria-pressed={cur.id === v.id} onClick={() => pick(v)}>
            <span className="orb3d"><i /></span><b>{v.n}</b><span className="dim">{v.g === 'f' ? 'Female' : 'Male'}, {v.d}</span></button>) })}</div>
        <div className="glass pad" style={{ padding: '6px 18px', marginBottom: 12 }}>
          <div className="csr" style={{ alignItems: 'flex-start' }}><span><b style={{ fontWeight: 400 }}>Finish</b><br /><span className="dim">The look of your robot</span></span>
            <div className="acts" style={{ margin: 0, gap: 6, justifyContent: 'flex-end' }}>{Object.keys(THEMES).map(k => { const T = (THEMES as any)[k]; return <Chip key={k} on={s.theme === k} onClick={() => { bd.saveSettings({ theme: k }); p.robot.current?.theme(k); p.robot.current?.spin() }}><i className="sw" style={{ background: `radial-gradient(circle at 30% 30%,${T.g1},${T.g2})` }} />{T.n}</Chip> })}</div></div>
          <div className="csr" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 10 }}><span><b style={{ fontWeight: 400 }}>Hear it</b></span>
            <textarea rows={2} style={{ width: '100%' }} value={sample} onChange={e => setSample(e.target.value)} aria-label="Try a line" />
            <div className="acts" style={{ margin: 0 }}><button className="btn p" onClick={() => speakText(sample, cur.ai, () => p.robot.current?.talk(true), () => p.robot.current?.talk(false)).catch((e: Error) => a.toast(e.message || 'Voice playback is unavailable'))}><Icon name="voice" size={16} />Preview voice</button></div></div>
        </div>
        <div className="glass pad" style={{ padding: 18, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}><span className="aiic"><Icon name="spark" size={20} /></span><h3 style={{ fontSize: 16 }}>Match my voice</h3></div>
          <p className="mut" style={{ fontSize: 13 }}>Speak naturally for five seconds. I will pick a voice that fits yours.</p>
          {vm.state === 'rec' && <><div className="vmeter">{[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => <i key={i} style={{ height: 14 + ((i * 7) % 5) * 8, animation: 'ldb 1.2s ease-in-out infinite', animationDelay: i * 0.08 + 's' }} />)}</div><p className="dim" style={{ marginTop: 8 }}>Listening... keep talking</p></>}
          {(vm.state === 'done' || vm.state === 'err') && <p style={{ marginTop: 10 }}>{vm.msg}</p>}
          <div className="acts"><button className="btn" disabled={vm.state === 'rec'} onClick={matchVoice}><Icon name="mic" size={16} />{vm.state === 'rec' ? 'Listening' : 'Start'}</button></div>
          <p className="dim" style={{ marginTop: 12, fontSize: 12 }}>This tunes a studio voice to feel like yours. It is not a clone. Cloning a real voice needs a dedicated voice service and that person's consent.</p>
        </div>
        <p className="dim" style={{ fontSize: 12 }}>Each preset has its own voice and speaking style. If studio speech is unavailable, QuorlythBot uses a matching voice from your browser. Voice cloning is not included.</p></>
    )
  }

  // settings
  return (
    <><h3 className="bvt">Settings</h3><p className="mut" style={{ margin: '6px 0 14px' }}>Advanced controls for QuorlythBot.</p>
      <div className="glass pad" style={{ padding: '6px 18px', marginBottom: 14 }}>
        <Chips label="Thinking" desc="Thorough takes longer and is more careful" value={s.model} onPick={v => bd.saveSettings({ model: v as any })} list={[['quick', 'Quick'], ['smart', 'Thorough']]} />
        <Chips label="Size" value={p.mode} onPick={v => p.setMode(v)} list={[['compact', 'Compact'], ['large', 'Large'], ['full', 'Full']]} />
        <Chips label="Robot size" value={p.stage} onPick={v => p.setStage(v)} list={[['std', 'Standard'], ['big', 'Large'], ['off', 'Hidden']]} />
      </div>
      <div className="glass pad" style={{ padding: 18, marginBottom: 14 }}><h3 style={{ fontSize: 15 }}>Your chats</h3><p className="dim" style={{ margin: '4px 0 12px' }}>{bd.chats.length} saved, private to you.</p>
        <div className="acts" style={{ margin: 0 }}>
          <button className="btn" onClick={() => { const u = URL.createObjectURL(new Blob([JSON.stringify(bd.chats, null, 2)], { type: 'application/json' })); const l = document.createElement('a'); l.href = u; l.download = 'quorlyth-bot-chats.json'; l.click(); URL.revokeObjectURL(u) }}><Icon name="publish" size={16} />Export chats</button>
          <button className="btn" onClick={() => { if (del !== 'all') return setDel('all'); bd.chats.forEach(c => bd.remove(c.id)); setDel(''); a.toast('Chats deleted') }}>{del === 'all' ? 'Confirm delete all' : 'Delete all chats'}</button></div></div>
      <div className="glass pad" style={{ padding: 18 }}><h3 style={{ fontSize: 15 }}>Shortcuts</h3>
        {[['Send', 'Enter'], ['New line', 'Shift Enter'], ['Skills', '/'], ['Close menus', 'Esc']].map(([k, v]) => <div key={k} className="kr"><span className="mut">{k}</span><kbd>{v}</kbd></div>)}
        <div className="acts"><button className="btn" onClick={() => { bd.saveSettings({ tone: 'warm', len: 'short', emo: false, about: '', voice: true, calm: false, robot: true, model: 'smart', vid: 'aria', theme: 'onyx' }); p.robot.current?.theme('onyx'); a.toast('Customization reset') }}><Icon name="rotate" size={16} />Reset customization</button></div></div></>
  )
}
