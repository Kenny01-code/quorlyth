import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { askJson } from '../ai/client'
import { useApp } from '../data/AppProvider'
import '../styles/page-assist.css'

type Guidance = { title: string; message: string; nextStep?: string }

const PAGE_GUIDES: Record<string, { name: string; goal: string; fallback: Guidance }> = {
  '/': { name: 'Home', goal: 'Explain Quorlyth’s purpose and how a signed-in creator can get started.', fallback: { title: 'Welcome to Quorlyth', message: 'Quorlyth brings communities, ideas and collaborative delivery into one place. Start by exploring a community or checking your workspace.', nextStep: 'Open your dashboard to see what needs attention.' } },
  '/onboarding': { name: 'Getting started', goal: 'Help the user complete onboarding and understand the first actions after sign-up.', fallback: { title: 'Let’s get you set up', message: 'Complete the essentials so your profile and community activity are ready. You can return to settings later to fine-tune preferences.', nextStep: 'Finish the required onboarding fields.' } },
  '/architecture': { name: 'System architecture', goal: 'Explain the architecture and system map, including the native automation runtime.', fallback: { title: 'Explore the system map', message: 'This page explains how Quorlyth’s application pieces connect. The Automations page contains your saved workflow definitions, execution history and visual trigger-to-action map.', nextStep: 'Open Automations to inspect a specific workflow.' } },
  '/promote': { name: 'Promotion studio', goal: 'Explain how selected ideas are prepared for promotion and credited.', fallback: { title: 'Prepare community ideas for sharing', message: 'Promotion tools help prepare selected community ideas for sharing while preserving contributor credit. Review the content and credits before publishing.', nextStep: 'Inspect the selected idea and attribution details.' } },
  '/database': { name: 'Database tools', goal: 'Explain that database tools are restricted and provide safe high-level context.', fallback: { title: 'Database administration', message: 'Database tools expose privileged operational data and are restricted to the verified roles. QuorlythBot cannot bypass those controls.', nextStep: 'Use the controls available to your account role.' } },
  '/dashboard': { name: 'Dashboard', goal: 'Help the user understand their overview, recent activity and next useful action.', fallback: { title: 'Your Quorlyth overview', message: 'Use this page to see what needs attention, track activity and jump back into active work.', nextStep: 'Start with the items marked as needing attention.' } },
  '/communities': { name: 'Communities', goal: 'Explain how to discover, manage and participate in communities.', fallback: { title: 'Communities, made easier', message: 'Browse communities, open one to see its ideas and discussions, or create a community when your account has permission.', nextStep: 'Open a community to see its ideas, members and settings.' } },
  '/queue': { name: 'Review queue', goal: 'Explain reviewing ideas and collaboration requests, and that decisions affect their status.', fallback: { title: 'Review with confidence', message: 'Use the queue to inspect incoming ideas and requests. Read the full submission before changing its status.', nextStep: 'Open an item to inspect its details and available decisions.' } },
  '/projects': { name: 'Projects', goal: 'Explain the project plan and collaboration milestones.', fallback: { title: 'From ideas to delivery', message: 'Projects connect selected ideas to a delivery plan. Open a project to review its brief, milestones and evidence.', nextStep: 'Check milestones and their definitions of done.' } },
  '/workspaces': { name: 'Workspaces', goal: 'Explain independent workspaces, tasks, members and evidence.', fallback: { title: 'Keep the work organised', message: 'Workspaces hold project briefs, team members, tasks and evidence. Owners and managers can organise tasks and assign contributors.', nextStep: 'Open a workspace to see its plan, team and tasks.' } },
  '/automations': { name: 'Automations', goal: 'Explain triggers, optional conditions, ordered actions, saving and run history.', fallback: { title: 'Automations in three parts', message: 'A workflow starts with a trigger, can narrow events with an optional condition, then runs its actions in order. Each run records step results.', nextStep: 'Start with a template, save it as a draft and test it from Run now.' } },
  '/collaborations': { name: 'Collaborations', goal: 'Explain the collaboration area and how ideas become shared project work.', fallback: { title: 'Coordinate shared work', message: 'Collaborations connect selected ideas with milestones, contributors and evidence review.', nextStep: 'Open a collaboration to inspect its plan, team and evidence.' } },
  '/messages': { name: 'Messages', goal: 'Explain direct/group messaging, voice notes, attachments and notifications.', fallback: { title: 'Stay in the conversation', message: 'Use Messages for direct and group conversations. You can share text, files and voice notes, and manage notification preferences in Settings.', nextStep: 'Open a conversation or start a new one.' } },
  '/analytics': { name: 'Analytics', goal: 'Explain the available metrics and caution against treating correlation as causation.', fallback: { title: 'Read the signals', message: 'Analytics helps you understand activity and engagement. Compare trends over time and use the underlying records to investigate changes.', nextStep: 'Choose a metric and inspect the period it covers.' } },
  '/growth': { name: 'Growth', goal: 'Explain activation, retention and usage signals.', fallback: { title: 'Understand growth signals', message: 'Growth shows how people move from joining to becoming active contributors. Use the milestones to find where onboarding or participation needs attention.', nextStep: 'Inspect the latest activation events and retention trend.' } },
  '/settings': { name: 'Settings', goal: 'Explain personal and application preferences, including notifications.', fallback: { title: 'Make Quorlyth work your way', message: 'Settings contains account preferences, notification controls and other options available to your role.', nextStep: 'Check message popups, notification sounds and desktop alerts.' } },
  '/access': { name: 'Access', goal: 'Explain requesting and managing account access.', fallback: { title: 'Access and permissions', message: 'This page shows access requests and the options available to your verified role. QuorlythBot follows the same permissions as your account.', nextStep: 'Review the status of your request or the requests you are authorised to manage.' } },
  '/me': { name: 'Profile', goal: 'Explain profile information and public profile.', fallback: { title: 'Your profile', message: 'Your profile shows the information other people can see about you. Keep your display name, headline and bio current.', nextStep: 'Review your profile details and how they appear to others.' } },
}

function pageGuide(path: string) {
  if (path.startsWith('/collaboration/')) return { name: 'Collaboration workspace', goal: 'Explain the active collaboration page, project plan, milestones, team and evidence sections.', fallback: { title: 'Your collaboration workspace', message: 'Use the plan to understand outcomes, the team area to see who is responsible, and evidence to review deliverables against the definition of done.', nextStep: 'Check the selected tab and the next milestone.' } }
  if (path.startsWith('/workspaces/')) return { name: 'Workspace detail', goal: 'Explain this independent workspace, its brief, task list, assignments and evidence.', fallback: { title: 'Your workspace, at a glance', message: 'The workspace brief describes the goal. Tasks divide the work into steps, and assignments show who is responsible. Completion still follows the evidence rules.', nextStep: 'Review unassigned tasks and upcoming due dates.' } }
  if (path.startsWith('/idea/')) return { name: 'Idea detail', goal: 'Explain this idea, discussion and related collaboration activity.', fallback: { title: 'Explore this idea', message: 'This page brings together the idea, its discussion and any related collaboration work. Check the status and latest activity before taking action.', nextStep: 'Read the description and open its collaboration area when available.' } }
  if (path.startsWith('/communities/')) return { name: 'Community detail', goal: 'Explain this community, its ideas, membership, settings and AI organizer access.', fallback: { title: 'Inside this community', message: 'Use the community sections to explore ideas and conversations. Management controls are shown only when your role allows them.', nextStep: 'Choose the section that matches what you want to do.' } }
  return PAGE_GUIDES[path] || null
}

export function PageAssist({ onAskBot }: { onAskBot: (prompt: string) => void }) {
  const app = useApp()
  const location = useLocation()
  const guide = useMemo(() => pageGuide(location.pathname), [location.pathname])
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [content, setContent] = useState<Guidance | null>(null)

  useEffect(() => {
    let active = true
    setVisible(false)
    setContent(null)
    if (!app.ready || !app.me || !guide || app.demo) return
    const key = 'quorlyth:page-assist:v1:' + app.me.id + ':' + location.pathname
    try {
      if (sessionStorage.getItem(key) === 'dismissed' || sessionStorage.getItem(key) === 'shown') return
      sessionStorage.setItem(key, 'shown')
    } catch {}
    const fallback = guide.fallback
    setContent(fallback)
    setLoading(true)
    const timer = window.setTimeout(() => { if (active) setVisible(true) }, 350)
    void askJson<Guidance>(JSON.stringify({
      page: guide.name,
      route: location.pathname,
      accountRole: app.owner ? 'verified platform owner' : app.platformAdmin ? 'platform administrator' : 'signed-in user',
      pageGoal: guide.goal,
      request: 'Write one short contextual help card: a clear title, a useful explanation and one concrete next step. Be specific to this Quorlyth page. Do not claim that any action has been performed. Do not ask the user to click an AI suggestion.',
    }), {
      tier: 'quick',
      system: 'You are Quorlyth’s proactive in-product guide. Your job is to make the current page understandable without taking over the screen. Return JSON only with title (max 52 chars), message (max 230 chars), nextStep (max 110 chars). Never invent features or permissions. Never recommend bypassing role checks. Never execute or propose data changes.',
    }).then(result => {
      if (!active) return
      const title = String(result.title || fallback.title).trim().slice(0, 52)
      const message = String(result.message || fallback.message).trim().slice(0, 230)
      const nextStep = String(result.nextStep || fallback.nextStep || '').trim().slice(0, 110)
      setContent({ title, message, nextStep })
    }).catch(() => {
      // A page guide still appears from grounded local copy when the AI service is unavailable.
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; window.clearTimeout(timer) }
  }, [app.ready, app.me?.id, app.owner, app.platformAdmin, app.demo, guide, location.pathname])

  if (!visible || !content) return null
  const dismiss = () => {
    try { if (app.me) sessionStorage.setItem('quorlyth:page-assist:v1:' + app.me.id + ':' + location.pathname, 'dismissed') } catch {}
    setVisible(false)
  }
  return (
    <aside className="page-assist" role="region" aria-label="Quorlyth page guide">
      <div className="page-assist-top"><span><i /> QUORLYTH GUIDE {loading ? '· PERSONALISING' : '· PAGE AWARE'}</span><button type="button" onClick={dismiss} aria-label="Dismiss page guide">×</button></div>
      <strong>{content.title}</strong>
      <p>{content.message}</p>
      {content.nextStep && <small>{content.nextStep}</small>}
      <div className="page-assist-actions"><button type="button" onClick={() => onAskBot('Help me with the ' + guide?.name + ' page. Explain the next steps and what I can do here using my current permissions.')}>Ask QuorlythBot</button><button type="button" onClick={dismiss}>Got it</button></div>
    </aside>
  )
}
