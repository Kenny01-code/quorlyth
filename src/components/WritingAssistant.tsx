import { useEffect, useState } from 'react'
import { streamChat } from '../ai/client'

type Point = { x: number; y: number }
type WritingMode = { id: string; label: string; instruction: string }

const MODES: WritingMode[] = [
  { id: 'polish', label: 'Improve', instruction: 'Rewrite this to be clearer, smoother, and more compelling while preserving my meaning and natural voice.' },
  { id: 'professional', label: 'Professional', instruction: 'Rewrite this in a polished, professional tone without making it stiff or generic.' },
  { id: 'concise', label: 'Shorten', instruction: 'Make this concise and direct while preserving every essential point.' },
  { id: 'friendly', label: 'Friendlier', instruction: 'Make this warm, natural, and friendly without sounding forced.' },
  { id: 'confident', label: 'More confident', instruction: 'Make this sound confident, clear, and self-assured without becoming arrogant.' },
  { id: 'persuasive', label: 'Persuasive', instruction: 'Strengthen the reasoning and persuasive flow without inventing facts or making unsupported promises.' },
  { id: 'grammar', label: 'Fix grammar', instruction: 'Correct grammar, spelling, punctuation, and awkward phrasing while changing as little as possible.' },
  { id: 'expand', label: 'Expand', instruction: 'Develop this into a more complete, useful version with clearer structure. Do not invent facts, names, dates, or commitments.' },
]

/** Inline writing help that follows the focused textarea and never navigates away. */
export function WritingAssistant() {
  const [target, setTarget] = useState<HTMLTextAreaElement | null>(null)
  const [anchor, setAnchor] = useState<Point>({ x: 0, y: 0 })
  const [panel, setPanel] = useState<Point>({ x: 12, y: 12 })
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<WritingMode>(MODES[0])
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const position = (el: HTMLTextAreaElement | null) => {
      if (!el?.isConnected) return
      const rect = el.getBoundingClientRect()
      setAnchor({
        x: Math.max(8, Math.min(window.innerWidth - 48, rect.right - 42)),
        y: Math.max(8, Math.min(window.innerHeight - 48, rect.bottom - 45)),
      })
      setPanel({
        x: Math.max(12, Math.min(window.innerWidth - 348, rect.right - 336)),
        y: rect.top > 390 ? Math.max(12, rect.top - 374) : Math.max(12, Math.min(window.innerHeight - 370, rect.bottom + 10)),
      })
    }
    const onFocusIn = (event: FocusEvent) => {
      const node = event.target as HTMLElement | null
      if (!node) return
      if (node.closest('.q-writing-assistant-ui')) return
      if (node instanceof HTMLTextAreaElement) {
        setTarget(node)
        setOpen(false)
        setPreview('')
        setError('')
        position(node)
      } else {
        setTarget(null)
        setOpen(false)
        setPreview('')
      }
    }
    const onMove = () => position(target)
    const observer = new MutationObserver(() => {
      if (target && !target.isConnected) {
        setTarget(null)
        setOpen(false)
      }
    })
    document.addEventListener('focusin', onFocusIn, true)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    if (document.body) observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      document.removeEventListener('focusin', onFocusIn, true)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
      observer.disconnect()
    }
  }, [target])

  async function improve(nextMode: WritingMode) {
    if (!target?.isConnected) return
    const source = target.value.trim()
    if (!source) {
      setError('Write a little first. QuorlythBot will polish what you have.')
      setOpen(true)
      return
    }
    setMode(nextMode)
    setOpen(true)
    setLoading(true)
    setPreview('')
    setError('')
    try {
      const result = await streamChat(
        [{ role: 'user', content: nextMode.instruction + '\n\nText to improve:\n' + source }],
        {
          tier: 'smart',
          system: 'You are QuorlythBot, an exceptional writing editor. Return only the revised text. Preserve the author’s intent, names, facts, and commitments. Never add fabricated details, claims, citations, or explanations. Match the requested tone and keep the result ready to paste.',
          onText: full => setPreview(full),
        },
      )
      setPreview(result.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'QuorlythBot could not improve this text. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function applyPreview() {
    if (!target?.isConnected || !preview.trim()) return
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(target, preview.trim())
    target.dispatchEvent(new Event('input', { bubbles: true }))
    target.dispatchEvent(new Event('change', { bubbles: true }))
    target.focus()
    setOpen(false)
    setPreview('')
    setError('')
  }

  if (!target?.isConnected) return null

  return (
    <>
      <div className="q-writing-assistant-anchor q-writing-assistant-ui" style={{ left: anchor.x, top: anchor.y }}>
        <button type="button" className={`q-writing-robot-button ${open ? 'is-open' : ''} ${loading ? 'is-thinking' : ''}`} title="Improve this text with QuorlythBot" aria-label="Improve this text with QuorlythBot" aria-expanded={open} onMouseDown={e => e.preventDefault()} onClick={() => { setOpen(v => !v); setError(''); setPreview('') }}>
          <span className="q-writing-robot-head" aria-hidden="true"><span className="q-writing-robot-antenna" /><span className="q-writing-robot-eye eye-left" /><span className="q-writing-robot-eye eye-right" /><span className="q-writing-robot-mouth" /></span>
          <span className="q-writing-robot-glint" />
        </button>
      </div>
      {open && <section className="q-writing-panel q-writing-assistant-ui" style={{ left: panel.x, top: panel.y }} aria-label="QuorlythBot writing assistant">
        <header className="q-writing-panel-head"><span className="q-writing-panel-symbol"><span className="q-writing-robot-head tiny"><span className="q-writing-robot-antenna" /><span className="q-writing-robot-eye eye-left" /><span className="q-writing-robot-eye eye-right" /><span className="q-writing-robot-mouth" /></span></span><div><b>QuorlythBot</b><small>WRITING ASSISTANT · STAYS HERE</small></div><button type="button" aria-label="Close writing assistant" onClick={() => setOpen(false)}>×</button></header>
        <div className="q-writing-modes">{MODES.map(item => <button type="button" key={item.id} className={mode.id === item.id ? 'on' : ''} disabled={loading} onClick={() => void improve(item)}>{item.label}</button>)}</div>
        {loading && <div className="q-writing-status"><span className="q-writing-pulse" />Refining your text…</div>}
        {error && <p className="q-writing-error" role="alert">{error}</p>}
        {preview && <div className="q-writing-preview"><p className="q-writing-preview-label">PREVIEW · {mode.label.toUpperCase()}</p><div>{preview}</div></div>}
        <footer className="q-writing-panel-footer"><span>{loading ? 'Keeping your meaning intact' : preview ? 'Review before applying' : 'Choose a writing style'}</span>{preview && !loading && <><button type="button" className="q-writing-secondary" onClick={() => { setPreview(''); setError('') }}>Discard</button><button type="button" className="q-writing-apply" onClick={applyPreview}>Apply text</button></>}</footer>
      </section>}
    </>
  )
}
