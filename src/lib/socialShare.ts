export type SocialShareTarget =
  | 'x'
  | 'facebook'
  | 'linkedin'
  | 'threads'
  | 'bluesky'
  | 'reddit'
  | 'whatsapp'
  | 'telegram'

export function socialShareUrl(
  target: SocialShareTarget,
  text: string,
  pageUrl: string,
  title = 'A post from Quorlyth',
): string {
  const message = encodeURIComponent(text)
  const url = encodeURIComponent(pageUrl)
  const heading = encodeURIComponent(title)
  const sharedText = pageUrl && !text.includes(pageUrl) ? text + '\\n' + pageUrl : text
  const messageWithLink = encodeURIComponent(sharedText)

  switch (target) {
    case 'x':
      return 'https://x.com/intent/tweet?text=' + messageWithLink
    case 'facebook':
      return 'https://www.facebook.com/sharer/sharer.php?u=' + url + '&quote=' + message
    case 'linkedin':
      return 'https://www.linkedin.com/sharing/share-offsite/?url=' + url
    case 'threads':
      return 'https://www.threads.net/intent/post?text=' + messageWithLink
    case 'bluesky':
      return 'https://bsky.app/intent/compose?text=' + messageWithLink
    case 'reddit':
      return 'https://www.reddit.com/submit?title=' + heading + '&url=' + url + '&selftext=' + message
    case 'whatsapp':
      return 'https://wa.me/?text=' + messageWithLink
    case 'telegram':
      return 'https://t.me/share/url?url=' + url + '&text=' + message
  }
}

export function openSocialShare(
  target: SocialShareTarget,
  text: string,
  pageUrl: string,
  title?: string,
): void {
  const destination = socialShareUrl(target, text, pageUrl, title)
  window.open(destination, '_blank', 'noopener,noreferrer')
}
