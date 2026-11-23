import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../lib/Icon'
import { Logo } from '../lib/Logo'

export function QuorlythBotHomePreview({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') {
        const controls = [...document.querySelectorAll<HTMLElement>('.qbot-home-preview button:not(:disabled), .qbot-home-preview [href], .qbot-home-preview textarea:not(:disabled)')]
        if (!controls.length) return
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    closeRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="qbot-home-preview-layer" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="qbot-home-preview" role="dialog" aria-modal="true" aria-labelledby="qbot-home-preview-title">
        <header className="qbot-home-preview-head">
          <span className="qbot-home-preview-brand"><Logo size={32} /><span><b id="qbot-home-preview-title">QuorlythBot</b><small>Your community copilot</small></span></span>
          <span className="qbot-home-preview-actions"><i>UI PREVIEW</i><button ref={closeRef} type="button" aria-label="Close QuorlythBot preview" onClick={onClose}><Icon name="decline" size={17} /></button></span>
        </header>
        <div className="qbot-home-preview-model"><span><span className="qbot-home-preview-live-dot" />Quorlyth Core</span><small>Preview</small></div>
        <div className="qbot-home-preview-thread">
          <div className="qbot-home-preview-intro"><span className="qbot-home-preview-mark"><Logo size={28} /></span><h2>A clearer view of your community.</h2><p>Ask a question, explore an idea, or find your next step.</p></div>
          <div className="qbot-home-preview-user">What are people most excited to build next?</div>
          <div className="qbot-home-preview-answer"><div className="qbot-home-preview-byline"><Logo size={18} /><b>QuorlythBot</b><i>Assistant</i></div><p>Members are responding most strongly to ideas that bring them together regularly. A creator-led weekly series is a promising place to start, with clear ways for the community to shape each episode.</p><div className="qbot-home-preview-reason"><Icon name="insight" size={15} /><span><b>Why this surfaced</b><small>Strong audience relevance · active discussion · clear first step</small></span></div></div>
        </div>
        <footer className="qbot-home-preview-foot">
          <div className="qbot-home-preview-composer"><span>Ask QuorlythBot anything…</span><div><button type="button" aria-label="Add attachment" title="Attachments are part of the preview concept"><Icon name="paperclip" size={17} /></button><button type="button" aria-label="Send sample prompt" className="qbot-home-preview-send"><Icon name="send" size={16} /></button></div></div>
          <div className="qbot-home-preview-chips"><span>Summarize ideas</span><span>Draft a post</span><span>Explore trends</span></div>
          <p>Visual preview only · AI responses are not connected here</p>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
