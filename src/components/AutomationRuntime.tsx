import { useEffect, useRef, useState } from 'react'
import { useApp } from '../data/AppProvider'
import {
  WorkflowDefinition,
  WorkflowEventDetail,
  WORKFLOW_EVENT_NAME,
  emitWorkflowEvent,
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
  const recentEvents = useRef(new Map<string, number>())

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
    const unsubscribes: Array<() => void> = []
    const seenIdeas = new Set<string>()
    const seenProjects = new Set<string>()
    const taskStatuses = new Map<string, string>()
    const milestoneStatuses = new Map<string, string>()
    const artifactStatuses = new Map<string, string>()
    let ideasReady = false
    let projectsReady = false
    let tasksReady = false
    let milestonesReady = false
    let artifactsReady = false

    // Supabase realtime lets a running Quorlyth session react to changes made by
    // other people in collections this user is already allowed to read. The local
    // event emits below keep demo/local workflows responsive too.
    unsubscribes.push(store.subscribe('ideas', docs => {
      if (!alive) return
      if (!ideasReady) {
        docs.forEach(doc => seenIdeas.add(doc.id))
        ideasReady = true
        return
      }
      for (const doc of docs) {
        if (seenIdeas.has(doc.id)) continue
        seenIdeas.add(doc.id)
        emitWorkflowEvent('idea.created', { id: doc.id, title: String(doc.data?.title || ''), body: String(doc.data?.body || ''), communityId: String(doc.data?.cid || ''), at: Number(doc.data?.at) || Date.now() })
      }
    }, error => console.warn('Workflow idea trigger could not refresh:', error)))

    unsubscribes.push(store.subscribe('standaloneProjects', docs => {
      if (!alive) return
      if (!projectsReady) {
        docs.forEach(doc => seenProjects.add(doc.id))
        projectsReady = true
        return
      }
      for (const doc of docs) {
        if (seenProjects.has(doc.id)) continue
        seenProjects.add(doc.id)
        emitWorkflowEvent('workspace.created', { id: doc.id, projectId: doc.id, title: String(doc.data?.title || ''), summary: String(doc.data?.summary || ''), at: Number(doc.data?.at) || Date.now() })
      }
    }, error => console.warn('Workflow workspace trigger could not refresh:', error)))

    unsubscribes.push(store.subscribe('standaloneTasks', docs => {
      if (!alive) return
      if (!tasksReady) {
        docs.forEach(doc => taskStatuses.set(doc.id, String(doc.data?.status || 'todo')))
        tasksReady = true
        return
      }
      for (const doc of docs) {
        const nextStatus = String(doc.data?.status || 'todo')
        const previousStatus = taskStatuses.get(doc.id)
        taskStatuses.set(doc.id, nextStatus)
        if (previousStatus && previousStatus !== 'done' && nextStatus === 'done') {
          emitWorkflowEvent('task.completed', { id: doc.id, taskId: doc.id, projectId: String(doc.data?.projectId || ''), title: String(doc.data?.title || ''), summary: String(doc.data?.description || ''), at: Number(doc.data?.updatedAt) || Date.now() })
        }
      }
    }, error => console.warn('Workflow task trigger could not refresh:', error)))

    const onWorkflowEvent = (raw: Event) => {
      const detail = (raw as CustomEvent<WorkflowEventDetail>).detail
      if (!detail?.type) return
      const eventId = String(detail.payload?.id || detail.payload?.taskId || detail.payload?.at || '')
      const dedupeKey = detail.type + ':' + eventId
      const now = Date.now()
      const previousEventAt = recentEvents.current.get(dedupeKey)
      if (previousEventAt && now - previousEventAt < 15000) return
      recentEvents.current.set(dedupeKey, now)
      for (const [key, time] of recentEvents.current) if (now - time > 60000) recentEvents.current.delete(key)

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
      unsubscribes.forEach(unsubscribe => unsubscribe())
    }
  }, [app.backend?.store, app.me?.id, app.demo, app.toast])

  return null
}
