import { useState } from 'react'

export const DEFAULTS = {
  bar: { m: 'ideas', o: 'v', s: 'value', n: 7, lab: true, grid: true, avg: false, pct: false },
  area: { pts: false, sm: true, ma: false, avg: false, grid: true, lab: false },
  heat: { val: false },
  don: { pct: true, tot: true },
  fun: { pct: true, rel: false },
  top: { m: 'ideas', n: 5 },
}
export type ChartSettings = typeof DEFAULTS
export type ChartKey = keyof ChartSettings

export function useChartSettings(scope: 'owner' | 'member' = 'owner') {
  const storageKey = scope === 'member' ? 'qcs:member:v1' : 'qcs'
  const [cs, setCs] = useState<ChartSettings>(() => {
    try { const s = JSON.parse(localStorage.getItem(storageKey) || '{}'); return Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, { ...(DEFAULTS as any)[k], ...(s[k] || {}) }])) as ChartSettings } catch { return DEFAULTS }
  })
  const save = (n: ChartSettings) => { setCs(n); try { localStorage.setItem(storageKey, JSON.stringify(n)) } catch {} }
  return {
    cs,
    set: (g: ChartKey, k: string, v: any) => save({ ...cs, [g]: { ...(cs[g] as any), [k]: v } }),
    reset: (g: ChartKey) => save({ ...cs, [g]: DEFAULTS[g] }),
  }
}

export type ChartSettingItem = ['t', string, string] | ['c', string, string, [string | number, string][]]
export const ITEMS: Record<ChartKey, ChartSettingItem[]> = {
  area: [['t', 'sm', 'Smooth line'], ['t', 'pts', 'Show points'], ['t', 'lab', 'Data labels'], ['t', 'avg', 'Average line'], ['t', 'ma', '7 day moving average'], ['t', 'grid', 'Gridlines']],
  bar: [['c', 'm', 'Measure', [['ideas', 'Ideas'], ['backs', 'Backings'], ['members', 'Members'], ['pub', 'Ready to share']]], ['c', 'o', 'Direction', [['v', 'Vertical'], ['h', 'Horizontal']]], ['c', 's', 'Sort', [['value', 'By value'], ['name', 'By name'], ['none', 'As created']]], ['c', 'n', 'Show', [[5, 'Top 5'], [7, 'Top 7'], [10, 'Top 10'], [0, 'All']]], ['t', 'lab', 'Data labels'], ['t', 'pct', 'Labels as percent of total'], ['t', 'grid', 'Gridlines'], ['t', 'avg', 'Average line']],
  don: [['t', 'pct', 'Show percentages'], ['t', 'tot', 'Total in the centre']],
  heat: [['t', 'val', 'Show values in cells']],
  fun: [['t', 'pct', 'Show percentages'], ['t', 'rel', 'Compare with the previous step']],
  top: [['c', 'm', 'Rank by', [['ideas', 'Ideas shared'], ['backs', 'Backings received']]], ['c', 'n', 'Show', [[5, 'Top 5'], [10, 'Top 10'], [20, 'Top 20']]]],
}
export const MEMBER_ITEMS: Record<ChartKey, ChartSettingItem[]> = {
  area: ITEMS.area,
  bar: [
    ['c', 'm', 'Measure', [['ideas', 'Ideas you shared'], ['backs', 'Backings received']]],
    ['c', 'o', 'Direction', [['v', 'Vertical'], ['h', 'Horizontal']]],
    ['c', 's', 'Sort', [['value', 'By value'], ['name', 'By name'], ['none', 'As joined']]],
    ['c', 'n', 'Show communities', [[5, 'Top 5'], [7, 'Top 7'], [10, 'Top 10'], [0, 'All']]],
    ['t', 'lab', 'Data labels'], ['t', 'pct', 'Labels as percent of total'], ['t', 'grid', 'Gridlines'], ['t', 'avg', 'Average line'],
  ],
  don: ITEMS.don,
  heat: ITEMS.heat,
  fun: [['t', 'pct', 'Show percentages'], ['t', 'rel', 'Compare with previous stage']],
  top: [
    ['c', 'm', 'Sort ideas by', [['ideas', 'Most recent'], ['backs', 'Most backed']]],
    ['c', 'n', 'Show ideas', [[5, '5 ideas'], [10, '10 ideas'], [20, '20 ideas']]],
  ],
}
export const TITLES: Record<ChartKey, string> = { area: 'Ideas per day', bar: 'Community comparison', don: 'Idea status breakdown', heat: 'When ideas arrive', fun: 'Idea pipeline', top: 'Top contributors' }
