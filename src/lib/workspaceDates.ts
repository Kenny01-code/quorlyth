export function localTodayDateInput(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return year + '-' + month + '-' + day
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
