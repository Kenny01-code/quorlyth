import { useEffect, useRef, useState } from 'react'
import { BotIcon as Icon } from './BotIcon'
import { Robot, RobotApi } from './Robot'
import { THEMES } from './config'

const GESTURES = [
  { id: 'rest', name: 'At ease', face: 'rest' },
  { id: 'explain', name: 'Explaining', face: 'talk' },
  { id: 'think', name: 'Thinking', face: 'think' },
  { id: 'wave', name: 'Wave', face: 'wave' },
  { id: 'welcome', name: 'Welcome', face: 'smile' },
  { id: 'cheer', name: 'Celebrate', face: 'cheer' },
] as const

export function RobotStudio({ theme, onThemeChange }: { theme: string; onThemeChange: (theme: string) => Promise<boolean> }) {
  const robot = useRef<RobotApi | null>(null)
  const [gesture, setGesture] = useState<string>('rest')
  const [autoRotate, setAutoRotate] = useState(false)
  const [scenes, setScenes] = useState([{ name: 'Default scene', theme: theme || 'pearl', gesture: 'rest', autoRotate: false }])
  const [scene, setScene] = useState('Default scene')
  const [search, setSearch] = useState('')
  const [leftTab, setLeftTab] = useState<'object' | 'assets'>('object')
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const gestureRef = useRef(gesture)
  const rotateRef = useRef(autoRotate)
  gestureRef.current = gesture
  rotateRef.current = autoRotate
  const selectedTheme = Object.prototype.hasOwnProperty.call(THEMES, theme) ? theme : 'terracotta'
  const activeScene = scenes.find(item => item.name === scene) || scenes[0]
  const layers = [
    { icon: 'camera', label: 'Camera' }, { icon: 'spark', label: 'Key light' },
    { icon: 'stage', label: 'QuorlythBot' }, { icon: 'idea', label: 'Head & face', child: true },
    { icon: 'db', label: 'Body shell', child: true }, { icon: 'contribute', label: 'Gesture rig', child: true },
  ].filter(layer => layer.label.toLowerCase().includes(search.trim().toLowerCase()))
  const finishes = (Object.entries(THEMES) as [keyof typeof THEMES, (typeof THEMES)[keyof typeof THEMES]][])
    .filter(([, preset]) => preset.n.toLowerCase().includes(search.trim().toLowerCase()))

  async function chooseTheme(nextTheme: string) {
    setSaveState('saving')
    const saved = await onThemeChange(nextTheme)
    setSaveState(saved ? 'saved' : 'error')
  }

  useEffect(() => { robot.current?.turn(autoRotate) }, [autoRotate])
  useEffect(() => { robot.current?.set(gesture) }, [gesture])
  useEffect(() => {
    setScenes(current => current.map(item => item.name === scene ? { ...item, theme: selectedTheme, gesture, autoRotate } : item))
  }, [selectedTheme, gesture, autoRotate, scene])

  function addScene() {
    const name = `Scene ${String(scenes.length + 1).padStart(2, '0')}`
    setScenes(current => [...current, { name, theme: selectedTheme, gesture, autoRotate }])
    setScene(name)
  }

  function selectScene(item: typeof scenes[number]) {
    setScene(item.name)
    setGesture(item.gesture)
    setAutoRotate(item.autoRotate)
    if (item.theme !== selectedTheme) void chooseTheme(item.theme)
  }

  return (
    <div className="qrs-studio">
      <header className="qrs-topbar">
        <div className="qrs-title-group">
          <span className="qrs-kicker">QUORLYTHBOT / DESIGN STUDIO</span>
          <h2>Robot studio</h2>
        </div>
        <div className="qrs-top-actions">
          <span className={'qrs-saved' + (saveState === 'error' ? ' is-error' : '')}><i />{saveState === 'saving' ? 'Saving finish...' : saveState === 'error' ? 'Could not save finish' : 'Saved to your bot settings'}</span>
          <button type="button" className="qrs-orange-button" onClick={() => { setGesture('rest'); setAutoRotate(false); robot.current?.turn(false) }}>
            <Icon name="rotate" size={15} /> Reset preview
          </button>
        </div>
      </header>

      <div className="qrs-editor">
        <aside className="qrs-left-panel" aria-label="Scene structure">
          <label className="qrs-search"><Icon name="search" size={15} /><input aria-label="Search scene elements" placeholder="Find in scene" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <div className="qrs-panel-tabs"><button type="button" className={leftTab === 'object' ? 'is-active' : ''} aria-pressed={leftTab === 'object'} onClick={() => setLeftTab('object')}>Object</button><button type="button" className={leftTab === 'assets' ? 'is-active' : ''} aria-pressed={leftTab === 'assets'} onClick={() => setLeftTab('assets')}>Assets</button></div>
          {leftTab === 'object' ? <>
          <div className="qrs-panel-section">
            <div className="qrs-section-heading"><strong>Scenes</strong><button type="button" title="Add scene" aria-label="Add scene" onClick={addScene}><Icon name="plus" size={15} /></button></div>
            {scenes.map((item, index) => <button type="button" key={item.name} className={'qrs-scene-row' + (item.name === scene ? ' is-selected' : '')} onClick={() => selectScene(item)}><span className="qrs-scene-index">{String(index + 1).padStart(2, '0')}</span>{item.name}<span className="qrs-scene-dot" /></button>)}
          </div>
          <div className="qrs-panel-section qrs-hierarchy">
            <div className="qrs-section-heading"><strong>Scene elements</strong><span>{String(layers.length).padStart(2, '0')}</span></div>
            {layers.map(layer => <div className={'qrs-layer-row' + (layer.label === 'QuorlythBot' ? ' is-parent' : '') + (layer.child ? ' is-child' : '')} key={layer.label}><Icon name={layer.icon} size={14} /><span>{layer.label}</span><i /></div>)}
          </div>
          </> : <div className="qrs-panel-section qrs-assets-panel"><div className="qrs-section-heading"><strong>Shell materials</strong><span>{finishes.length}</span></div>{finishes.map(([id, preset]) => <button type="button" key={id} className={'qrs-asset-card' + (selectedTheme === id ? ' is-selected' : '')} aria-pressed={selectedTheme === id} onClick={() => void chooseTheme(id)}><i style={{ background: `linear-gradient(145deg,${preset.g1},${preset.g2})` }} /><span><b>{preset.n}</b><small>Robot shell · metallic</small></span></button>)}</div>}
          <div className="qrs-left-foot"><span className="qrs-online-dot" />Local 3D preview <span>WebGL</span></div>
        </aside>

        <main className="qrs-workspace" aria-label="Interactive robot preview">
          <div className="qrs-viewport">
            <div className="qrs-viewport-grid" aria-hidden="true" />
            <div className="qrs-viewport-toolbar">
              <div><span className="qrs-live-badge"><i />LIVE PREVIEW</span><span className="qrs-scene-name">{activeScene.name}</span></div>
              <button type="button" className={'qrs-view-toggle' + (autoRotate ? ' is-active' : '')} aria-pressed={autoRotate} onClick={() => setAutoRotate(value => !value)}><Icon name="rotate" size={14} />{autoRotate ? 'Auto-rotate on' : 'Auto-rotate off'}</button>
            </div>
            <div className="qrs-model-stage">
              <div className="qrs-model-shadow" aria-hidden="true" />
              <div className="qrs-robot-canvas"><Robot ref={robot} theme={selectedTheme} drag active defer onReady={() => { robot.current?.set(gestureRef.current); robot.current?.turn(rotateRef.current) }} /></div>
              <span className="qrs-drag-hint"><Icon name="select" size={13} /> Drag to orbit</span>
            </div>
            <div className="qrs-viewport-footer"><span><i />QuorlythBot Core</span><span>Interactive 3D scene <b>01</b></span></div>
          </div>
          <div className="qrs-stage-tools" aria-label="Preview controls">
            <span className="qrs-tool-active"><Icon name="select" size={16} />Select</span>
            <button type="button" onClick={() => robot.current?.spin()}><Icon name="rotate" size={16} />Turntable</button>
            <button type="button" onClick={() => setGesture('wave')}><Icon name="wave" size={16} />Preview gesture</button>
            <span className="qrs-tool-spacer" />
            <span className="qrs-zoom-readout">100%</span>
          </div>
        </main>

        <aside className="qrs-right-panel" aria-label="Robot appearance settings">
          <div className="qrs-panel-heading"><div><span className="qrs-kicker">PERSONA</span><h3>QuorlythBot</h3></div><span className="qrs-version">CORE V1</span></div>
          <section className="qrs-setting-section">
            <div className="qrs-setting-title"><strong>Shell finish</strong><span>Choose a material</span></div>
            <div className="qrs-finish-list">
              {(Object.entries(THEMES) as [keyof typeof THEMES, (typeof THEMES)[keyof typeof THEMES]][]).map(([id, preset]) => <button type="button" key={id} className={'qrs-finish-option' + (selectedTheme === id ? ' is-selected' : '')} aria-pressed={selectedTheme === id} onClick={() => void chooseTheme(id)}>
                <i style={{ background: `linear-gradient(145deg, ${preset.g1}, ${preset.g2})` }} /><span><b>{preset.n}</b><small>{id === 'terracotta' ? 'Quorlyth signature' : 'Pearlescent alloy'}</small></span>{selectedTheme === id && <Icon name="check" size={15} />}
              </button>)}
            </div>
          </section>

          <section className="qrs-setting-section qrs-gesture-section">
            <div className="qrs-setting-title"><strong>Gesture states</strong><span>Preview a motion</span></div>
            <div className="qrs-gesture-grid">
              {GESTURES.map(item => <button type="button" key={item.id} className={'qrs-gesture-card' + (gesture === item.id ? ' is-selected' : '')} aria-pressed={gesture === item.id} onClick={() => setGesture(item.id)}>
                <span className={'qrs-face qrs-face-' + item.face}><i /><i /><b /></span><small>{item.name}</small>
              </button>)}
            </div>
          </section>

          <section className="qrs-motion-control">
            <span className="qrs-motion-icon"><Icon name="voice" size={17} /></span>
            <span><b>Idle animation</b><small>Let the model move gently</small></span>
            <button type="button" role="switch" aria-checked={autoRotate} aria-label="Idle animation" className={'qrs-switch' + (autoRotate ? ' is-on' : '')} onClick={() => setAutoRotate(value => !value)}><i /></button>
          </section>
          <p className="qrs-panel-note">Changes to the shell finish save to your private QuorlythBot settings. Gesture previews are temporary.</p>
        </aside>
      </div>
    </div>
  )
}
