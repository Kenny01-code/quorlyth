import { useCallback, useEffect, useMemo, useState } from 'react'
import { Gate } from '../components/Gate'
import { Head } from '../components/ui'
import { Icon } from '../lib/Icon'
import { useApp } from '../data/AppProvider'
import type { GrowthEvent, GrowthEventName } from '../data/docstore'
import { download } from './Analytics'
import '../styles/growth.css'

type Range = 7 | 30 | 90 | 0

const EVENT_LABEL: Record<GrowthEventName, string> = {
  account_created: 'Account created',
  active_day: 'Active day',
  onboarding_started: 'Onboarding started',
  onboarding_completed: 'Onboarding completed',
  profile_completed: 'Profile completed',
  community_created: 'Community created',
  member_joined: 'Member joined',
  idea_submitted: 'Idea submitted',
  project_created: 'Workspace started',
  invite_link_shared: 'Invite link shared',
}

const ACTIVATION_EVENTS = new Set<GrowthEventName>(['community_created', 'idea_submitted', 'project_created'])
const dayMs = 86_400_000

function uniqueUsers(events: GrowthEvent[]) {
  return new Set(events.map(event => event.user_id).filter(Boolean)).size
}

function dateLabel(value: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleDateString(undefined, options)
}

function shortId(value: string) {
  return value ? value.slice(0, 8) + '…' : 'Unknown account'
}

function Metric({ label, value, detail, icon }: { label: string; value: string | number; detail: string; icon: string }) {
  return (
    <article className="glass pad growth-metric">
      <div className="growth-metric__top"><span className="growth-metric__icon"><Icon name={icon} size={17} /></span><span className="dim">{label}</span></div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}

export function Growth() {
  return <Gate platformAdminOnly><GrowthDashboard /></Gate>
}

function GrowthDashboard() {
  const app = useApp()
  const [events, setEvents] = useState<GrowthEvent[]>([])
  const [range, setRange] = useState<Range>(30)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  const load = useCallback(async (quiet = false) => {
    if (!app.backend) return
    if (quiet) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const rows = await app.backend.store.listGrowthEvents()
      setEvents(rows)
      setLastUpdated(Date.now())
    } catch (cause) {
      console.error('Could not load Quorlyth growth analytics:', cause)
      setError('Growth data could not be loaded. Confirm this account has platform administrator access, then refresh.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [app.backend])

  useEffect(() => { void load() }, [load])

  const derived = useMemo(() => {
    const now = Date.now()
    const start = range === 0 ? 0 : now - range * dayMs
    const inRange = events.filter(event => new Date(event.occurred_at).getTime() >= start)
    const signups = events.filter(event => event.event_name === 'account_created')
    const periodSignups = signups.filter(event => new Date(event.occurred_at).getTime() >= start)
    const activatedAfterSignup = periodSignups.filter(signup => events.some(event =>
      event.user_id === signup.user_id
      && ACTIVATION_EVENTS.has(event.event_name)
      && new Date(event.occurred_at).getTime() >= new Date(signup.occurred_at).getTime(),
    ))
    const activeEvents = inRange.filter(event => event.event_name === 'active_day')
    const allActiveDayEvents = events.filter(event => event.event_name === 'active_day')
    const trackingStartedAt = allActiveDayEvents.length
      ? Math.min(...allActiveDayEvents.map(event => new Date(event.occurred_at).getTime()))
      : now
    const weeklyActiveEvents = allActiveDayEvents.filter(event => new Date(event.occurred_at).getTime() >= now - 7 * dayMs)
    const weeklyActiveUsers = uniqueUsers(weeklyActiveEvents)
    const retentionCohort = (days: 7 | 30) => {
      const windowMs = days * dayMs
      const mature = signups.filter(signup => {
        const signedUpAt = new Date(signup.occurred_at).getTime()
        return signedUpAt >= trackingStartedAt && signedUpAt + windowMs <= now
      })
      const retained = mature.filter(signup => {
        const signedUpAt = new Date(signup.occurred_at).getTime()
        return allActiveDayEvents.some(event => {
          const eventAt = new Date(event.occurred_at).getTime()
          return event.user_id === signup.user_id && eventAt > signedUpAt + dayMs && eventAt <= signedUpAt + windowMs
        })
      })
      return { total: mature.length, returned: retained.length, rate: mature.length ? Math.round(retained.length / mature.length * 100) : null }
    }
    const retention7 = retentionCohort(7)
    const retention30 = retentionCohort(30)
    const activeDaysByUser = new Map<string, Set<string>>()
    for (const event of activeEvents) {
      const day = event.event_key || new Date(event.occurred_at).toISOString().slice(0, 10)
      const days = activeDaysByUser.get(event.user_id) || new Set<string>()
      days.add(day)
      activeDaysByUser.set(event.user_id, days)
    }
    const activeUsers = activeDaysByUser.size
    const returningUsers = [...activeDaysByUser.values()].filter(days => days.size >= 2).length
    const creatorAccounts = uniqueUsers(events.filter(event => event.event_name === 'community_created'))
    const ideaCreators = uniqueUsers(events.filter(event => event.event_name === 'idea_submitted'))
    const workspaceCreators = uniqueUsers(events.filter(event => event.event_name === 'project_created'))
    const memberJoins = inRange.filter(event => event.event_name === 'member_joined')
    const inviteShares = inRange.filter(event => event.event_name === 'invite_link_shared').length
    const completedOnboarding = uniqueUsers(inRange.filter(event => event.event_name === 'onboarding_completed'))
    const startedOnboarding = uniqueUsers(inRange.filter(event => event.event_name === 'onboarding_started'))
    const signupCount = signups.length
    const activationRate = periodSignups.length
      ? Math.round((activatedAfterSignup.length / periodSignups.length) * 100)
      : 0

    const chartDays = 14
    const daily = Array.from({ length: chartDays }, (_, index) => {
      const date = new Date(now - (chartDays - index - 1) * dayMs)
      const key = date.toISOString().slice(0, 10)
      const dayEvents = allActiveDayEvents.filter(event => (event.event_key || event.occurred_at.slice(0, 10)) === key)
      const signupEvents = signups.filter(event => event.occurred_at.slice(0, 10) === key)
      return { key, label: date.toLocaleDateString(undefined, { weekday: 'short' }), active: uniqueUsers(dayEvents), signups: signupEvents.length }
    })

    const allTime = [
      { label: 'Accounts registered', value: signupCount, description: 'Unique authenticated accounts' },
      { label: 'Created a community', value: creatorAccounts, description: 'Accounts that started a community' },
      { label: 'Submitted an idea', value: ideaCreators, description: 'Accounts that submitted at least one idea' },
      { label: 'Started a workspace', value: workspaceCreators, description: 'Accounts that created a collaboration workspace' },
    ]
    const maxFunnel = Math.max(1, ...allTime.map(item => item.value))
    const recent = [...inRange].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()).slice(0, 14)
    const eventCounts = (Object.keys(EVENT_LABEL) as GrowthEventName[]).map(name => ({
      name,
      label: EVENT_LABEL[name],
      count: inRange.filter(event => event.event_name === name).length,
    })).filter(item => item.count > 0).sort((a, b) => b.count - a.count)

    return {
      allTime, maxFunnel, recent, daily, eventCounts,
      totalUsers: signupCount,
      newUsers: periodSignups.length,
      activated: activatedAfterSignup.length,
      activationRate,
      activeUsers,
      weeklyActiveUsers,
      returningUsers,
      returnRate: activeUsers ? Math.round((returningUsers / activeUsers) * 100) : 0,
      retention7,
      retention30,
      inviteShares,
      memberJoins: memberJoins.length,
      completedOnboarding,
      startedOnboarding,
    }
  }, [events, range])

  const exportCsv = () => {
    const quote = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"'
    const rows = events.map(event => [
      event.occurred_at,
      event.event_name,
      event.user_id,
      event.actor_id || '',
      event.event_key || '',
    ].map(quote).join(','))
    download(
      'quorlyth-growth-events.csv',
      'text/csv;charset=utf-8',
      ['occurred_at,event_name,user_id,actor_id,event_key', ...rows].join('\n'),
    )
  }

  return (
    <div className="growth-page">
      <Head
        kicker="Platform intelligence"
        title="Growth & activation."
        right={<>
          <button className="btn" style={{ padding: '9px 16px' }} onClick={exportCsv} disabled={!events.length}><Icon name="publish" size={15} />Export CSV</button>
          <button className="btn p" style={{ padding: '9px 16px' }} onClick={() => { void load(true) }} disabled={refreshing}><Icon name="rotate" size={15} />{refreshing ? 'Refreshing' : 'Refresh'}</button>
        </>}
      />

      <div className="growth-intro glass">
        <div className="growth-intro__mark"><Icon name="timeline" size={21} /></div>
        <div>
          <p className="growth-intro__title">From first visit to an active community.</p>
          <p className="growth-intro__copy">Track signups, creator activation, community participation and returning accounts. Product milestones are captured from committed database records, while daily active days and onboarding steps are recorded from signed-in sessions.</p>
          {lastUpdated && <p className="growth-updated">Updated {new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}
        </div>
      </div>

      <div className="growth-toolbar">
        <div className="growth-ranges" role="group" aria-label="Analytics date range">
          {([7, 30, 90, 0] as Range[]).map(value => (
            <button key={value} className={range === value ? 'is-active' : ''} onClick={() => setRange(value)}>{value === 0 ? 'All time' : value + ' days'}</button>
          ))}
        </div>
        <span className="dim">Showing {range === 0 ? 'all recorded time' : 'the last ' + range + ' days'}</span>
      </div>

      {error && <div className="glass growth-error" role="alert"><Icon name="alert" size={18} />{error}</div>}

      {loading ? (
        <div className="glass pad growth-loading"><span className="growth-spinner" /><p>Loading platform activity…</p></div>
      ) : (
        <>
          <div className="grid g4 growth-metrics">
            <Metric label="Total accounts" value={derived.totalUsers} detail={derived.newUsers + ' registered in this period'} icon="users" />
            <Metric label="Activated signups" value={derived.activationRate + '%'} detail={derived.activated + ' of ' + derived.newUsers + ' new accounts created a community, submitted an idea or started a workspace'} icon="spark" />
            <Metric label="Active accounts" value={derived.activeUsers} detail="Unique accounts with a recorded active day" icon="live" />
            <Metric label="Returning accounts" value={derived.returnRate + '%'} detail={derived.returningUsers + ' accounts active on 2 or more days in this period'} icon="timeline" />
          </div>

          <div className="grid g2 growth-panels">
            <section className="glass pad">
              <div className="growth-section-heading"><div><p className="dim">ACTIVITY</p><h3>Daily account activity</h3><p className="mut">Active days and new signups over the last two weeks</p></div></div>
              <div className="growth-daily-chart-scroll">
                <div className="growth-daily-chart">
                {derived.daily.map(day => {
                  const max = Math.max(1, ...derived.daily.map(item => Math.max(item.active, item.signups)))
                  return <div className="growth-daily-column" key={day.key} title={day.key + ': ' + day.active + ' active, ' + day.signups + ' signups'}>
                    <div className="growth-daily-bars">
                      <i className="active" style={{ height: Math.max(3, day.active / max * 100) + '%' }} />
                      <i className="signup" style={{ height: Math.max(3, day.signups / max * 100) + '%' }} />
                    </div>
                    <span>{day.label}</span>
                  </div>
                })}
                </div>
              </div>
              <div className="growth-legend"><span><i className="active" />Active accounts</span><span><i className="signup" />New signups</span></div>
            </section>

            <section className="glass pad">
              <div className="growth-section-heading"><div><p className="dim">CREATOR JOURNEY · ALL TIME</p><h3>Activation milestones</h3><p className="mut">Accounts progressing through key creator actions</p></div></div>
              <div className="growth-funnel">
                {derived.allTime.map((item, index) => (
                  <div className="growth-funnel-row" key={item.label}>
                    <div className="growth-funnel-copy"><span>{String(index + 1).padStart(2, '0')} / {item.label}</span><strong>{item.value}</strong></div>
                    <div className="growth-funnel-track"><i style={{ width: Math.max(item.value ? 4 : 0, item.value / derived.maxFunnel * 100) + '%' }} /></div>
                    <small>{item.description}</small>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="grid g3 growth-secondary">
            <Metric label="Community joins" value={derived.memberJoins} detail="New member joins in this period" icon="community" />
            <Metric label="Onboarding completed" value={derived.completedOnboarding} detail={derived.startedOnboarding + ' accounts started tracked onboarding'} icon="check" />
            <Metric label="Weekly active accounts" value={derived.weeklyActiveUsers} detail="Unique accounts active at least once in the last 7 days" icon="live" />
          </div>

          <section className="glass pad growth-panels">
            <div className="growth-section-heading"><div><p className="dim">ENGAGEMENT MIX</p><h3>What accounts are doing</h3><p className="mut">Count of recorded events in the selected period</p></div></div>
            {derived.eventCounts.length ? (
              <div className="growth-event-counts">
                {derived.eventCounts.map(item => <div key={item.name}><span>{item.label}</span><strong>{item.count}</strong></div>)}
              </div>
            ) : <p className="growth-empty">No events were recorded in this date range yet.</p>}
          </section>

          <div className="grid g2 growth-bottom">
            <section className="glass pad">
              <div className="growth-section-heading"><div><p className="dim">RETENTION</p><h3>Return behaviour</h3><p className="mut">Based on unique active days, not page views.</p></div></div>
              <div className="growth-retention">
                <strong>{derived.returnRate}%</strong>
                <div><b>Recorded return rate</b><p>{derived.returningUsers} of {derived.activeUsers} active accounts returned on at least one additional day within the selected range.</p></div>
              </div>
              <div className="growth-cohort-grid">
                <div><span>7-day cohort</span><strong>{derived.retention7.rate === null ? '—' : derived.retention7.rate + '%'}</strong><small>{derived.retention7.returned} of {derived.retention7.total} matured signups returned on a later day</small></div>
                <div><span>30-day cohort</span><strong>{derived.retention30.rate === null ? '—' : derived.retention30.rate + '%'}</strong><small>{derived.retention30.returned} of {derived.retention30.total} matured signups returned on a later day</small></div>
              </div>
              <p className="growth-note">Cohorts begin at the first recorded active day after this release. Signups need a complete 7- or 30-day observation window, and return activity must occur after signup day. Historical sign-in days are not reconstructed.</p>
            </section>

            <section className="glass pad">
              <div className="growth-section-heading"><div><p className="dim">LIVE FEED</p><h3>Recent milestones</h3><p className="mut">Latest account and creator activity</p></div></div>
              {derived.recent.length ? (
                <div className="growth-recent-list">
                  {derived.recent.map(event => <div className="growth-recent-row" key={event.id}>
                    <span className="growth-recent-dot" />
                    <div><b>{EVENT_LABEL[event.event_name]}</b><small>{shortId(event.user_id) + ' · ' + dateLabel(event.occurred_at, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></div>
                  </div>)}
                </div>
              ) : <p className="growth-empty">No milestones yet.</p>}
            </section>
          </div>
        </>
      )}
      <p className="growth-footnote">Internal platform metrics. Community and idea content is not included in this event ledger. Access is limited by Supabase row-level security to verified platform administrators.</p>
    </div>
  )
}
