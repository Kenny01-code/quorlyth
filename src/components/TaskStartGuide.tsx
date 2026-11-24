import { useState } from 'react'
import { askJson } from '../ai/client'
import { QuorlythGlyph } from './QuorlythGlyph'
import '../styles/task-start-guide.css'

const DEFAULT_STEPS = [
  'Read the brief and definition of done. Confirm any unclear requirement with the project manager before you begin.',
  'Break the outcome into the smallest useful deliverable and gather the tools, files or access you need.',
  'Complete the first visible piece of work, then check it against the acceptance criteria.',
  'Share a concise progress update and submit the real work as evidence when it is ready for review.',
]

export function TaskStartGuide({ title, description = '', acceptanceCriteria = '' }: {
  title: string
  description?: string
  acceptanceCriteria?: string
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [steps, setSteps] = useState<string[]>([])
  const [notice, setNotice] = useState('')

  async function openGuide() {
    if (open) { setOpen(false); return }
    setOpen(true)
    if (steps.length) return
    setLoading(true)
    setNotice('')
    try {
      const result = await askJson<{ steps?: unknown[] }>(
        'Create a practical starting plan for this assigned task.\nTask: ' + title +
        '\nBrief: ' + description +
        '\nDefinition of done: ' + acceptanceCriteria +
        '\nReturn JSON only with a steps array containing 3 to 5 short, specific, actionable steps. The first step must be something the assignee can do immediately. Do not invent tools, credentials, files or decisions that were not supplied.',
        { tier: 'quick', system: 'You are QuorlythBot acting as a thoughtful delivery lead. Turn a task brief into a clear first-work plan. Be specific, realistic and concise. Keep the assignee in control; never claim to have performed the work.' },
      )
      const safeSteps = Array.isArray(result?.steps)
        ? result.steps.filter((step): step is string => typeof step === 'string' && step.trim().length > 0).slice(0, 5).map(step => step.trim())
        : []
      if (!safeSteps.length) throw new Error('No practical steps were returned.')
      setSteps(safeSteps)
    } catch {
      setSteps(DEFAULT_STEPS)
      setNotice('QuorlythBot could not create a tailored plan right now, so here is a reliable starting sequence.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="qth-task-start-guide">
      <button type="button" className="qth-task-start-guide__trigger" onClick={() => void openGuide()} aria-expanded={open}>
        <span><QuorlythGlyph name="spark" size={15} />{loading ? 'Preparing your first steps…' : steps.length ? 'Your starting plan' : 'Help me get started'}</span>
        <QuorlythGlyph name={open ? 'chevron-up' : 'arrow'} size={14} />
      </button>
      {open && <div className="qth-task-start-guide__body">
        {loading ? <p className="qth-task-start-guide__loading">QuorlythBot is turning the brief into practical first steps…</p> : <>
          {notice && <p className="qth-task-start-guide__notice">{notice}</p>}
          <ol>{steps.map((step, index) => <li key={index}><span>{String(index + 1).padStart(2, '0')}</span><p>{step}</p></li>)}</ol>
          <p className="qth-task-start-guide__footnote">Use these as a guide. The task brief and its definition of done remain the source of truth.</p>
        </>}
      </div>}
    </section>
  )
}
