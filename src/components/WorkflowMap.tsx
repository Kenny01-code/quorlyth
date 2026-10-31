import { useMemo } from 'react'
import { ACTION_INFO, TRIGGER_INFO, WorkflowDefinition, WorkflowRun } from '../lib/automation'
import { QuorlythGlyph } from './QuorlythGlyph'
import '../styles/workflow-map.css'

type RunRecord = WorkflowRun & { workflowId?: string; workflowName?: string }

function ActionIcon({ type }: { type: string }) {
  return <QuorlythGlyph name={type === 'create_task' ? 'workspace' : type === 'webhook' ? 'send' : 'bell'} size={15} />
}

export function WorkflowMap({ workflows, runs }: { workflows: WorkflowDefinition[]; runs: RunRecord[] }) {
  const mapped = useMemo(() => workflows.slice().sort((a,b) => a.name.localeCompare(b.name)).map(workflow => ({
    workflow,
    latest: runs.find(run => run.workflowId === workflow.id) || workflow.runHistory?.[0] || null,
  })), [workflows, runs])

  return (
    <section className="wa-map-section" aria-label="Workflow structure map">
      <div className="wa-section-title">
        <div><p className="wa-eyebrow">WORKFLOW CANVAS</p><h3>How each flow is connected.</h3><p>A visual map of the saved definition: trigger → optional filter → ordered actions. This is Quorlyth’s native workflow map, not a connected n8n instance.</p></div>
        <span className="wa-template-count">{workflows.length} flow{workflows.length === 1 ? '' : 's'} mapped</span>
      </div>
      {!mapped.length ? <div className="wa-map-empty">Save a workflow to see its structure here.</div> : (
        <div className="wa-map-list">
          {mapped.map(({ workflow, latest }) => (
            <article className="wa-map-card" key={workflow.id}>
              <header className="wa-map-header">
                <div><strong>{workflow.name}</strong><p>{workflow.description || 'No description added.'}</p></div>
                <span className={'wa-map-status ' + workflow.status}>{workflow.status === 'active' ? 'Active' : 'Draft'}</span>
              </header>
              <div className="wa-map-flow">
                <div className="wa-map-node trigger">
                  <span className="wa-map-node-icon"><QuorlythGlyph name="start" size={16} /></span>
                  <div><small>TRIGGER</small><strong>{TRIGGER_INFO[workflow.trigger]?.title || workflow.trigger}</strong><p>{TRIGGER_INFO[workflow.trigger]?.description || ''}</p></div>
                  <b>01</b>
                </div>
                <div className="wa-map-link"><i /></div>
                {workflow.condition?.trim() && <>
                  <div className="wa-map-node condition">
                    <span className="wa-map-node-icon"><QuorlythGlyph name="sliders" size={16} /></span>
                    <div><small>OPTIONAL CONDITION</small><strong>Text contains</strong><p>{workflow.condition}</p></div>
                    <b>FILTER</b>
                  </div>
                  <div className="wa-map-link"><i /></div>
                </>}
                {(workflow.actions || []).map((action, index) => {
                  const latestStep = latest?.steps?.find(step => step.id === action.id)
                  return <div key={action.id}>
                    <div className={'wa-map-node action ' + (latestStep?.status || '')}>
                      <span className="wa-map-node-icon"><ActionIcon type={action.type} /></span>
                      <div><small> ACTION {String(index + 1).padStart(2,'0')} · {ACTION_INFO[action.type]?.title || action.type}</small><strong>{action.title || ACTION_INFO[action.type]?.title || 'Action'}</strong><p>{action.type === 'notify' ? action.message || 'Save an in-app notification.' : action.type === 'create_task' ? (action.taskTitle || 'Create a workspace task') : 'POST an event payload to the configured HTTPS endpoint.'}</p></div>
                      <b>{latestStep?.status === 'success' ? 'DONE' : latestStep?.status === 'failed' ? 'FAILED' : String(index + 2).padStart(2,'0')}</b>
                    </div>
                    {index < workflow.actions.length - 1 && <div className="wa-map-link"><i /></div>}
                  </div>
                })}
              </div>
              <footer className="wa-map-footer"><span>Last run: {latest ? latest.status.toUpperCase() : 'NOT RUN'}</span><span>{workflow.actions.length} ordered action{workflow.actions.length === 1 ? '' : 's'}</span><span>{workflow.condition?.trim() ? 'Filter enabled' : 'No filter'}</span></footer>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
