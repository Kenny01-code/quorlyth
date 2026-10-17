import { useEffect, useState } from 'react'
import { askJson, streamChat } from '../ai/client'

type Point = { x: number; y: number }
type WritingMode = { id: string; label: string; instruction: string; kind?: 'suggestions' }

const MODES: WritingMode[] = [
  { id: 'suggestions', label: 'Suggestions', instruction: 'Generate three distinct, field-specific writing suggestions.', kind: 'suggestions' },
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
  const [options, setOptions] = useState<string[]>([])
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
        setOptions([])
        setError('')
        position(node)
      } else {
        setTarget(null)
        setOpen(false)
        setPreview('')
        setOptions([])
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

  function describeField(el: HTMLTextAreaElement) {
    const label = el.closest('label')?.querySelector('span')?.textContent?.replace(/\s+/g, ' ').trim()
      || el.getAttribute('aria-label')
      || el.name
      || 'Text field'
    const heading = el.closest('form')?.querySelector('h1, h2, h3')?.textContent?.replace(/\s+/g, ' ').trim()
      || document.querySelector('main h1, main h2, main h3')?.textContent?.replace(/\s+/g, ' ').trim()
      || ''
    return { label: label.slice(0, 140), placeholder: (el.placeholder || '').slice(0, 240), heading: heading.slice(0, 160), route: window.location.pathname }
  }

  async function improve(nextMode: WritingMode) {
    if (!target?.isConnected) return
    const source = target.value.trim()
    const field = describeField(target)
    if (!source && nextMode.kind !== 'suggestions') {
      setError('Write a little first, or choose Suggestions to get a starting point for this field.')
      setOpen(true)
      return
    }
    setMode(nextMode)
    setOpen(true)
    setLoading(true)
    setPreview('')
    setOptions([])
    setError('')
    try {
      if (nextMode.kind === 'suggestions') {
        const result = await askJson<{ suggestions?: string[] }>(JSON.stringify({
          task: 'Create three useful, distinct draft options for a form field in a community collaboration app.',
          field,
          existingText: source,
          requirements: [
            'Match the exact purpose of the field and its page; do not write generic filler.',
            'Preserve supplied names, facts, limits, and commitments. Do not invent facts or claim actions have happened.',
            'If existing text is present, retain its intent while offering genuinely different improvements.',
            'If the field is empty, provide realistic starting drafts based on its label and placeholder.',
            'Keep each suggestion concise and ready to use.',
            'Return only JSON shaped as {"suggestions":["option one","option two","option three"]}.',
          ],
        }), { tier: 'quick' })
        const generated = Array.isArray(result?.suggestions)
          ? result.suggestions.map(value => String(value || '').trim()).filter(Boolean).slice(0, 3)
          : []
        if (!generated.length) throw new Error('QuorlythBot could not prepare suggestions for this field. Try again.')
        setOptions(generated)
        return
      }
      const context = [
        'Form field: ' + field.label,
        field.placeholder ? 'Placeholder guidance: ' + field.placeholder : '',
        field.heading ? 'Current page section: ' + field.heading : '',
        'Current app route: ' + field.route,
      ].filter(Boolean).join('\n')
      const result = await streamChat(
        [{ role: 'user', content: nextMode.instruction + '\n\n' + context + '\n\nText to improve:\n' + source }],
        {
          tier: 'quick',
          system: 'You are QuorlythBot, a fast and context-aware writing editor for Quorlyth. Return only the revised text. Use the field label, placeholder, and page section to make the result relevant. Preserve the author’s intent, names, facts, and commitments. Never add fabricated details, claims, citations, or explanations. Match the requested tone and keep the result ready to paste.',
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

  function applyText(value: string) {
    if (!target?.isConnected || !value.trim()) return
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(target, value.trim())
    target.dispatchEvent(new Event('input', { bubbles: true }))
    target.dispatchEvent(new Event('change', { bubbles: true }))
    target.focus()
    setOpen(false)
    setPreview('')
    setOptions([])
    setError('')
  }

  function applyPreview() {
    applyText(preview)
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
        {options.length > 0 && <div className="q-writing-options" aria-label="AI writing suggestions">
          <p className="q-writing-preview-label">SUGGESTED FOR THIS FIELD</p>
          {options.map((option, index) => <button type="button" key={index} className="q-writing-option" onMouseDown={e => e.preventDefault()} onClick={() => applyText(option)}>
            <span className="q-writing-option-number">{String(index + 1).padStart(2, '0')}</span><span className="q-writing-option-text">{option}</span><span className="q-writing-option-use">Use</span>
          </button>)}
        </div>}
        {preview && <div className="q-writing-preview"><p className="q-writing-preview-label">PREVIEW · {mode.label.toUpperCase()}</p><div>{preview}</div></div>}
        <footer className="q-writing-panel-footer"><span>{loading ? 'Preparing a focused suggestion' : options.length ? 'Choose one to use it' : preview ? 'Review before applying' : 'AI help adapts to this field'}</span>{preview && !loading && <><button type="button" className="q-writing-secondary" onClick={() => { setPreview(''); setError('') }}>Discard</button><button type="button" className="q-writing-apply" onClick={applyPreview}>Apply text</button></>}</footer>
      </section>}
    </>
  )
}
