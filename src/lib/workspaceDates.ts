export function localTodayDateInput(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: string) => parts.find(item => item.type === type)?.value || ''
  return part('year') + '-' + part('month') + '-' + part('day')
}

export function isPastDateInput(value?: string | null): boolean {
  return !!value && value < localTodayDateInput()
}

export function isPastDateChange(value: string | null | undefined, originalValue?: string | null): boolean {
  return isPastDateInput(value) && value !== (originalValue || '')
}

/**
 * When editing a record whose existing deadline is already overdue, keep that
 * existing date selectable so unrelated edits do not make the form invalid.
 * Newly selected deadlines must still be today or later.
 */
export function minimumDateInput(originalValue?: string | null): string {
  const today = localTodayDateInput()
  return originalValue && originalValue < today ? originalValue : today
}

export const PAST_DATE_MESSAGE = 'Choose today or a future date for the deadline.'
