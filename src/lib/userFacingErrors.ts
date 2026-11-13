/**
 * Keep low-level database, transport, and authorization details out of UI messages.
 * Known application validation messages remain useful; unknown failures receive safe
 * actionable copy while full error details stay in the developer console.
 */
export function userFacingMutationError(error: unknown, action = 'complete this action'): string {
  const raw = String((error as { message?: unknown } | null)?.message || error || '').trim()

  if (/Invalid document path or payload/i.test(raw)) {
    return "Quorlyth couldn't save this workflow run record. Refresh the page and try again. If it happens again, contact support with the time of the failed run."
  }

  if (/42501|row.?level security|new row violates|violates .*policy|permission denied|not authorized|forbidden|insufficient privilege|access denied/i.test(raw)) {
    return "Quorlyth couldn't confirm your access to " + action + ". Refresh and try again. If it keeps happening, contact the community owner or a platform administrator."
  }

  if (/failed to fetch|networkerror|network request|timeout|timed out|connection (?:lost|reset|refused)|fetch failed|econn(?:reset|refused|timedout)|network is offline/i.test(raw)) {
    return "A connection issue stopped Quorlyth from trying to " + action + ". Check your connection and try again."
  }

  if (/postgres|postgrest|sqlstate|duplicate key|foreign key constraint|check constraint|relation .* does not exist|column .* does not exist|violates .*constraint|supabase|apierror|schema cache|invalid input syntax|JWT|token expired|HTTP [45]\d\d|internal server error|uncaught exception|typeerror|referenceerror|syntaxerror|stack trace|query failed|database error|server-side .* failed/i.test(raw)) {
    return "Quorlyth couldn't " + action + " right now. Your changes were not confirmed as saved. Refresh and try again."
  }

  const knownApplicationMessage = /^(?:QuorlythBot is temporarily unavailable because the OpenAI account has no API credits remaining\b|QuorlythBot could not get a response from the available AI services\b|The AI service could not authenticate this request\b|Gemini did not respond within the configured provider timeout\b|Sign in\b|Only\b|Community not found\b|The backend\b|Idea not found\b|Ideas in an archived\b|An idea\b|There are no idea changes\b|Your session\b|Some private work attachments\b|This discussion\b|Write a reply\b|This collaboration\b|This application\b|The idea for\b|Add a short\b|Choose a valid\b|A workspace\b|The community owner\b|A project summary\b|Milestones\b|Create the project\b|Reopen the project\b|The project idea\b|Collaborators\b|This milestone\b|The project workspace\b|This project\b|Add a meaningful\b|Attach\b|One of the attachments\b|Your latest submission\b|The submission\b|Explain what needs\b|You are already\b|Your join request\b|Platform owners\b|Your AI organizer\b|Choose approve\b|This AI organizer\b|This community\b|You cannot\b|Only this workspace\b|An active\b|Please\b|No\b|A file\b|A message\b|The selected community\b|The selected idea\b|The current\b|The requested\b|Your latest\b|This account\b|This member\b)/i

  if (raw && raw.length <= 240 && knownApplicationMessage.test(raw) && !/[<>\r\n]/.test(raw)) {
    return raw
  }

  return "Quorlyth couldn't " + action + ". Please refresh and try again. If the issue continues, contact support."
}
