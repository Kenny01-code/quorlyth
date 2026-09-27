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

export function useChartSettings() {
  const [cs, setCs] = useState<ChartSettings>(() => {
    try { const s = JSON.parse(localStorage.getItem('qcs') || '{}'); return Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, { ...(DEFAULTS as any)[k], ...(s[k] || {}) }])) as ChartSettings } catch { return DEFAULTS }
  })
  const save = (n: ChartSettings) => { setCs(n); try { localStorage.setItem('qcs', JSON.stringify(n)) } catch {} }
  return {
    cs,
    set: (g: ChartKey, k: string, v: any) => save({ ...cs, [g]: { ...(cs[g] as any), [k]: v } }),
    reset: (g: ChartKey) => save({ ...cs, [g]: DEFAULTS[g] }),
  }
}

type Item = ['t', string, string] | ['c', string, string, [string | number, string][]]
export const ITEMS: Record<ChartKey, Item[]> = {
  area: [['t', 'sm', 'Smooth line'], ['t', 'pts', 'Show points'], ['t', 'lab', 'Data labels'], ['t', 'avg', 'Average line'], ['t', 'ma', '7 day moving average'], ['t', 'grid', 'Gridlines']],
  bar: [['c', 'm', 'Measure', [['ideas', 'Ideas'], ['backs', 'Backings'], ['members', 'Members'], ['pub', 'Published']]], ['c', 'o', 'Direction', [['v', 'Vertical'], ['h', 'Horizontal']]], ['c', 's', 'Sort', [['value', 'By value'], ['name', 'By name'], ['none', 'As created']]], ['c', 'n', 'Show', [[5, 'Top 5'], [7, 'Top 7'], [10, 'Top 10'], [0, 'All']]], ['t', 'lab', 'Data labels'], ['t', 'pct', 'Labels as percent of total'], ['t', 'grid', 'Gridlines'], ['t', 'avg', 'Average line']],
  don: [['t', 'pct', 'Show percentages'], ['t', 'tot', 'Total in the centre']],
  heat: [['t', 'val', 'Show values in cells']],
  fun: [['t', 'pct', 'Show percentages'], ['t', 'rel', 'Compare with the previous step']],
  top: [['c', 'm', 'Rank by', [['ideas', 'Ideas shared'], ['backs', 'Backings received']]], ['c', 'n', 'Show', [[5, 'Top 5'], [10, 'Top 10'], [20, 'Top 20']]]],
}
export const TITLES: Record<ChartKey, string> = { area: 'Ideas per day', bar: 'Ideas by community', don: 'Idea pipeline', heat: 'When ideas arrive', fun: 'From member to published', top: 'Top contributors' }
