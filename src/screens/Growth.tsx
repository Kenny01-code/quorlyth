import { useCallback, useEffect, useMemo, useState } from 'react'
import { Gate } from '../components/Gate'
import { Head } from '../components/ui'
import { Icon } from '../lib/Icon'
import { useApp } from '../data/AppProvider'
import type { GrowthEvent, GrowthEventName } from '../data/docstore'
import { download } from './Analytics'
import '../styles/growth.css'

type Range = 7 | 30 | 90 | 0
type TrendMetric = 'both' | 'active' | 'signups'

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
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('both')
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

    // The selected range controls this trend: daily for 7/30 days, weekly for 90 days, monthly for all history.
    const trendGranularity = range === 7 || range === 30 ? 'day' : range === 90 ? 'week' : 'month'
    const trendStartDate = new Date(now)
    let trendStart = now
    let trendBucketCount = 0
    let trendBucketMs = dayMs
    if (trendGranularity === 'day') {
      trendStartDate.setHours(0, 0, 0, 0)
      trendStartDate.setDate(trendStartDate.getDate() - (range - 1))
      trendStart = trendStartDate.getTime()
      trendBucketCount = range
    } else if (trendGranularity === 'week') {
      trendStart = now - 90 * dayMs
      trendBucketCount = 13
      trendBucketMs = 7 * dayMs
    } else {
      const observedTimes = events.map(event => new Date(event.occurred_at).getTime()).filter(Number.isFinite)
      const earliest = observedTimes.length ? Math.min(...observedTimes) : now - 365 * dayMs
      const earliestDate = new Date(earliest)
      const currentDate = new Date(now)
      let monthOffset = (currentDate.getFullYear() - earliestDate.getFullYear()) * 12 + currentDate.getMonth() - earliestDate.getMonth()
      monthOffset = Math.max(0, Math.min(119, monthOffset))
      trendStartDate.setFullYear(currentDate.getFullYear(), currentDate.getMonth() - monthOffset, 1)
      trendStartDate.setHours(0, 0, 0, 0)
      trendStart = trendStartDate.getTime()
      trendBucketCount = monthOffset + 1
    }
    trendBucketCount = Math.max(1, trendBucketCount)
    const activeByTrendBucket = Array.from({ length: trendBucketCount }, () => new Set<string>())
    const signupCountsByTrendBucket = Array.from({ length: trendBucketCount }, () => new Set<string>())
    const trendBucketIndex = (value: string) => {
      const date = new Date(value)
      const at = date.getTime()
      if (!Number.isFinite(at) || at < trendStart) return -1
      if (trendGranularity === 'month') {
        const first = new Date(trendStart)
        return (date.getFullYear() - first.getFullYear()) * 12 + date.getMonth() - first.getMonth()
      }
      return Math.floor((at - trendStart) / trendBucketMs)
    }
    for (const event of allActiveDayEvents) {
      const index = trendBucketIndex(event.occurred_at)
      if (index >= 0 && index < activeByTrendBucket.length) activeByTrendBucket[index].add(event.user_id || event.id)
    }
    for (const event of signups) {
      const index = trendBucketIndex(event.occurred_at)
      if (index >= 0 && index < signupCountsByTrendBucket.length) signupCountsByTrendBucket[index].add(event.user_id || event.id)
    }
    const trend = Array.from({ length: trendBucketCount }, (_, index) => {
      const bucketDate = new Date(trendStart)
      if (trendGranularity === 'month') bucketDate.setMonth(bucketDate.getMonth() + index)
      else bucketDate.setTime(trendStart + index * trendBucketMs)
      const label = trendGranularity === 'day'
        ? (range === 7 ? bucketDate.toLocaleDateString(undefined, { weekday: 'short' }) : dateLabel(bucketDate.toISOString(), { month: 'short', day: 'numeric' }))
        : trendGranularity === 'week'
          ? dateLabel(bucketDate.toISOString(), { month: 'short', day: 'numeric' })
          : bucketDate.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
      return { key: trendGranularity + '-' + index, label, active: activeByTrendBucket[index].size, signups: signupCountsByTrendBucket[index].size }
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
      allTime, maxFunnel, recent, trend, trendGranularity, eventCounts,
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

  const chartWidth = Math.max(620, derived.trend.length * 48)
  const chartHeight = 236
  const chartMax = Math.max(1, ...derived.trend.map(point => Math.max(point.active, point.signups)))
  const chartX = (index: number) => 34 + (derived.trend.length <= 1 ? 0 : index * (chartWidth - 68) / (derived.trend.length - 1))
  const chartY = (value: number) => 188 - (value / chartMax) * 142
  const activeLine = derived.trend.map((point, index) => chartX(index) + ',' + chartY(point.active)).join(' ')
  const signupLine = derived.trend.map((point, index) => chartX(index) + ',' + chartY(point.signups)).join(' ')

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
              <div className="growth-section-heading"><div><p className="dim">GROWTH TRENDS</p><h3>Momentum over time</h3><p className="mut">{derived.trendGranularity === 'day' ? 'Daily' : derived.trendGranularity === 'week' ? 'Weekly' : 'Monthly'} active-account and signup trends for the selected range</p></div></div>
              <div className="growth-trend-controls" role="group" aria-label="Filter trend metrics">
                {([
                  ['both', 'All trends'],
                  ['active', 'Active accounts'],
                  ['signups', 'New signups'],
                ] as Array<[TrendMetric, string]>).map(([value, label]) => (
                  <button key={value} type="button" className={trendMetric === value ? 'is-active' : ''} aria-pressed={trendMetric === value} onClick={() => setTrendMetric(value)}>{label}</button>
                ))}
              </div>
              <div className="growth-trend-scroll">
                <svg className="growth-trend-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} width={chartWidth} height={chartHeight} role="img" aria-label="Line chart of active accounts and new signups over time">
                  <title>Quorlyth growth trends</title>
                  {[0, 1, 2, 3].map(tick => {
                    const y = 188 - tick * (142 / 3)
                    const value = Math.round(chartMax * tick / 3)
                    return <g key={tick}>
                      <line x1="34" x2={chartWidth - 34} y1={y} y2={y} className="growth-trend-gridline" />
                      <text x="26" y={y + 4} textAnchor="end" className="growth-trend-axis-label">{value}</text>
                    </g>
                  })}
                  {trendMetric !== 'signups' && <polyline points={activeLine} className="growth-trend-line is-active-users" />}
                  {trendMetric !== 'active' && <polyline points={signupLine} className="growth-trend-line is-signups" />}
                  {derived.trend.map((point, index) => <g key={point.key}>
                    {trendMetric !== 'signups' && <circle cx={chartX(index)} cy={chartY(point.active)} r="3.5" className="growth-trend-point is-active-users"><title>{point.label}: {point.active} active accounts</title></circle>}
                    {trendMetric !== 'active' && <circle cx={chartX(index)} cy={chartY(point.signups)} r="3.5" className="growth-trend-point is-signups"><title>{point.label}: {point.signups} new signups</title></circle>}
                    {(index === 0 || index === derived.trend.length - 1 || index === Math.floor((derived.trend.length - 1) / 2)) && <text x={chartX(index)} y="218" textAnchor="middle" className="growth-trend-x-label">{point.label}</text>}
                  </g>)}
                </svg>
              </div>
              <div className="growth-trend-legend">
                {trendMetric !== 'signups' && <span><i className="is-active-users" />Active accounts</span>}
                {trendMetric !== 'active' && <span><i className="is-signups" />New signups</span>}
                <small>Counts are deduplicated by account within each time bucket.</small>
              </div>
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
