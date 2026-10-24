import { useEffect, useRef, useState } from 'react'
import { useApp } from '../data/AppProvider'
import {
  WorkflowDefinition,
  WorkflowEventDetail,
  WORKFLOW_EVENT_NAME,
  executeWorkflowActions,
  persistWorkflowRun,
  workflowMatchesEvent,
} from '../lib/automation'

/**
 * A small app-wide runtime listens to meaningful Quorlyth events. Workflow
 * definitions live in the signed-in user's private data path, so they remain
 * isolated by the existing docs row-level security policy.
 */
export function AutomationRuntime() {
  const app = useApp()
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([])
  const workflowsRef = useRef<WorkflowDefinition[]>([])
  const activeRuns = useRef(new Set<string>())

  workflowsRef.current = workflows

  useEffect(() => {
    const store = app.backend?.store
    const userId = app.me?.id
    if (!store || !userId) {
      setWorkflows([])
      return
    }

    const collection = 'data/users/' + userId + '/automations'
    return store.subscribe(collection, docs => {
      setWorkflows(docs.map(doc => ({ ...doc.data, id: doc.data?.id || doc.id }) as WorkflowDefinition))
    }, error => {
      console.warn('Workflow automations could not refresh:', error)
    })
  }, [app.backend?.store, app.me?.id, app.demo])

  useEffect(() => {
    const store = app.backend?.store
    const userId = app.me?.id
    if (!store || !userId) return

    let alive = true
    const onWorkflowEvent = (raw: Event) => {
      const detail = (raw as CustomEvent<WorkflowEventDetail>).detail
      if (!detail?.type) return

      const matching = workflowsRef.current.filter(workflow => workflowMatchesEvent(workflow, detail))
      for (const workflow of matching) {
        const runKey = workflow.id + ':' + detail.type + ':' + String(detail.payload?.id || detail.payload?.at || Date.now())
        if (activeRuns.current.has(runKey)) continue
        activeRuns.current.add(runKey)

        void (async () => {
          const path = 'data/users/' + userId + '/automations/' + workflow.id
          try {
            const run = await executeWorkflowActions(workflow, userId, store, detail, message => {
              if (alive) app.toast(message)
            })
            await persistWorkflowRun(store, path, run)
            if (alive && run.status === 'failed') app.toast('Automation "' + workflow.name + '" stopped: ' + (run.error || 'an action failed'))
          } catch (error) {
            console.error('Workflow execution could not be recorded:', error)
            if (alive) app.toast('Automation "' + workflow.name + '" could not finish. Check its configuration.')
          } finally {
            activeRuns.current.delete(runKey)
          }
        })()
      }
    }

    window.addEventListener(WORKFLOW_EVENT_NAME, onWorkflowEvent)
    return () => {
      alive = false
      window.removeEventListener(WORKFLOW_EVENT_NAME, onWorkflowEvent)
    }
  }, [app.backend?.store, app.me?.id, app.demo, app.toast])

  return null
}
