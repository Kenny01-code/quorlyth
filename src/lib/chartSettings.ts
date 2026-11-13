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

function isOneOf<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback
}

function booleanSetting(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeChartSettings(value: unknown, scope: 'owner' | 'member'): ChartSettings {
  const raw = value && typeof value === 'object' ? value as Record<string, any> : {}
  const area = raw.area && typeof raw.area === 'object' ? raw.area : {}
  const bar = raw.bar && typeof raw.bar === 'object' ? raw.bar : {}
  const heat = raw.heat && typeof raw.heat === 'object' ? raw.heat : {}
  const don = raw.don && typeof raw.don === 'object' ? raw.don : {}
  const fun = raw.fun && typeof raw.fun === 'object' ? raw.fun : {}
  const top = raw.top && typeof raw.top === 'object' ? raw.top : {}
  return {
    area: {
      sm: booleanSetting(area.sm, DEFAULTS.area.sm),
      pts: booleanSetting(area.pts, DEFAULTS.area.pts),
      lab: booleanSetting(area.lab, DEFAULTS.area.lab),
      avg: booleanSetting(area.avg, DEFAULTS.area.avg),
      ma: booleanSetting(area.ma, DEFAULTS.area.ma),
      grid: booleanSetting(area.grid, DEFAULTS.area.grid),
    },
    bar: {
      m: isOneOf(bar.m, scope === 'member' ? ['ideas', 'backs'] as const : ['ideas', 'backs', 'members', 'pub'] as const, DEFAULTS.bar.m),
      o: isOneOf(bar.o, ['v', 'h'] as const, DEFAULTS.bar.o),
      s: isOneOf(bar.s, ['value', 'name', 'none'] as const, DEFAULTS.bar.s),
      n: isOneOf(bar.n, [0, 5, 7, 10] as const, DEFAULTS.bar.n),
      lab: booleanSetting(bar.lab, DEFAULTS.bar.lab),
      grid: booleanSetting(bar.grid, DEFAULTS.bar.grid),
      avg: booleanSetting(bar.avg, DEFAULTS.bar.avg),
      pct: booleanSetting(bar.pct, DEFAULTS.bar.pct),
    },
    heat: { val: booleanSetting(heat.val, DEFAULTS.heat.val) },
    don: {
      pct: booleanSetting(don.pct, DEFAULTS.don.pct),
      tot: booleanSetting(don.tot, DEFAULTS.don.tot),
    },
    fun: {
      pct: booleanSetting(fun.pct, DEFAULTS.fun.pct),
      rel: booleanSetting(fun.rel, DEFAULTS.fun.rel),
    },
    top: {
      m: isOneOf(top.m, scope === 'member' ? ['ideas', 'backs'] as const : ['ideas', 'backs'] as const, DEFAULTS.top.m),
      n: isOneOf(top.n, [5, 10, 20] as const, DEFAULTS.top.n),
    },
  }
}

export function useChartSettings(scope: 'owner' | 'member' = 'owner') {
  const storageKey = scope === 'member' ? 'qcs:member:v1' : 'qcs'
  const [cs, setCs] = useState<ChartSettings>(() => {
    try { return normalizeChartSettings(JSON.parse(localStorage.getItem(storageKey) || '{}'), scope) }
    catch { return normalizeChartSettings({}, scope) }
  })
  const save = (next: ChartSettings) => {
    const normalized = normalizeChartSettings(next, scope)
    setCs(normalized)
    try { localStorage.setItem(storageKey, JSON.stringify(normalized)) } catch {}
  }
  return {
    cs,
    set: (g: ChartKey, k: string, v: any) => save({ ...cs, [g]: { ...(cs[g] as any), [k]: v } }),
    reset: (g: ChartKey) => save({ ...cs, [g]: { ...DEFAULTS[g] } as any }),
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
