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
        const payload = {
          id: doc.id,
          taskId: doc.id,
          projectId: String(doc.data?.projectId || ''),
          title: String(doc.data?.title || ''),
          summary: String(doc.data?.description || ''),
          at: Number(doc.data?.updatedAt) || Date.now(),
        }
        if (previousStatus === 'todo' && nextStatus === 'in_progress') emitWorkflowEvent('task.started', payload)
        if (previousStatus && previousStatus !== 'done' && nextStatus === 'done') emitWorkflowEvent('task.completed', payload)
      }
    }, error => console.warn('Workflow task trigger could not refresh:', error)))

    unsubscribes.push(store.subscribe('milestones', docs => {
      if (!alive) return
      if (!milestonesReady) {
        docs.forEach(doc => milestoneStatuses.set(doc.id, String(doc.data?.status || 'todo')))
        milestonesReady = true
        return
      }
      for (const doc of docs) {
        const nextStatus = String(doc.data?.status || 'todo')
        const previousStatus = milestoneStatuses.get(doc.id)
        milestoneStatuses.set(doc.id, nextStatus)
        if (previousStatus === 'todo' && nextStatus === 'in_progress') emitWorkflowEvent('milestone.started', {
          id: doc.id,
          projectId: String(doc.data?.projectId || ''),
          title: String(doc.data?.title || ''),
          summary: String(doc.data?.acceptanceCriteria || doc.data?.description || ''),
          at: Number(doc.data?.updatedAt) || Date.now(),
        })
      }
    }, error => console.warn('Workflow milestone trigger could not refresh:', error)))

    unsubscribes.push(store.subscribe('standaloneArtifacts', docs => {
      if (!alive) return
      if (!artifactsReady) {
        docs.forEach(doc => artifactStatuses.set(doc.id, String(doc.data?.status || 'submitted')))
        artifactsReady = true
        return
      }
      for (const doc of docs) {
        const nextStatus = String(doc.data?.status || 'submitted')
        const previousStatus = artifactStatuses.get(doc.id)
        artifactStatuses.set(doc.id, nextStatus)
        const payload = {
          id: doc.id,
          projectId: String(doc.data?.projectId || ''),
          taskId: String(doc.data?.taskId || ''),
          title: String(doc.data?.summary || 'Evidence submitted'),
          summary: String(doc.data?.summary || ''),
          status: nextStatus,
          at: Number(doc.data?.updatedAt || doc.data?.submittedAt) || Date.now(),
        }
        if (!previousStatus) emitWorkflowEvent('evidence.submitted', payload)
        else if (previousStatus === 'submitted' && (nextStatus === 'approved' || nextStatus === 'changes_requested')) emitWorkflowEvent('evidence.reviewed', payload)
      }
    }, error => console.warn('Workflow evidence trigger could not refresh:', error)))

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
          const runPath = 'data/users/' + userId + '/automation-runs/' + encodeURIComponent(runKey).slice(0, 180)
          try {
            // A stable INSERT claim prevents two open tabs or devices from
            // executing the same workflow for the same database event.
            await store.create(runPath, {
              id: runKey,
              workflowId: workflow.id,
              workflowName: workflow.name,
              trigger: detail.type,
              status: 'running',
              startedAt: now,
              finishedAt: 0,
              eventTitle: String(detail.payload?.title || detail.payload?.summary || ''),
              steps: [],
            })
            const saveProgress = async run => {
              await store.update(runPath, {
                ...run,
                workflowId: workflow.id,
                workflowName: workflow.name,
                updatedAt: Date.now(),
              })
            }
            const run = await executeWorkflowActions(workflow, userId, store, detail, message => {
              if (alive) app.toast(message)
            }, saveProgress)
            await saveProgress(run)
            await persistWorkflowRun(store, path, run)
            if (alive && run.status === 'failed') app.toast('Automation "' + workflow.name + '" stopped: ' + (run.error || 'an action failed'))
          } catch (error) {
            const message = String(error?.message || error)
            if (/23505|duplicate key|unique constraint/i.test(message)) return
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
