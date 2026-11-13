export type BotGreetingKind = 'first' | 'returning' | 'long-break' | 'quiet'

export interface BotGreetingInput {
  name?: string
  firstTime: boolean
  lastOpenedAt?: number
  now?: number
}

export interface BotGreeting {
  kind: BotGreetingKind
  text: string
}

const QUIET_WINDOW_MS = 6 * 60 * 60 * 1000
const LONG_BREAK_MS = 7 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const RETURNING_MESSAGES = [
  "Good to have you back. Let's see which ideas and collaborations deserve attention.",
  "Welcome back. We can pick up where you left off and check what has moved.",
  "You're back. I'll help you find the useful updates without digging through everything.",
]

const LONG_BREAK_MESSAGES = [
  "It's been a little while. Let's catch up on what's changed across your communities, ideas, and collaborations.",
  "Welcome back. A lot can happen while you're away; let's find the most important updates first.",
  "Good to see you again. Let's reconnect the dots between fresh ideas, active people, and work that's ready to move.",
]

/** Keep greetings personal without repeating the same name on every bot open. */
export function createBotGreeting({ name, firstTime, lastOpenedAt = 0, now = Date.now() }: BotGreetingInput): BotGreeting {
  const elapsed = lastOpenedAt > 0 ? Math.max(0, now - lastOpenedAt) : Number.POSITIVE_INFINITY

  if (!firstTime && lastOpenedAt > 0 && elapsed < QUIET_WINDOW_MS) {
    return { kind: 'quiet', text: '' }
  }

  if (firstTime) {
    const text = name
      ? `Hey ${name}, welcome to Quorlyth. I'm your community copilot. I'll help surface promising ideas, keep collaborations moving, and turn your community's best ideas into action.`
      : "Welcome to Quorlyth. I'm your community copilot. I'll help you explore communities, find promising ideas, and keep collaborations moving."
    return { kind: 'first', text }
  }

  const daySlot = Math.floor(now / DAY_MS)
  if (lastOpenedAt > 0 && elapsed >= LONG_BREAK_MS) {
    return { kind: 'long-break', text: LONG_BREAK_MESSAGES[daySlot % LONG_BREAK_MESSAGES.length] }
  }

  return { kind: 'returning', text: RETURNING_MESSAGES[daySlot % RETURNING_MESSAGES.length] }
}
