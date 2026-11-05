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

  switch (target) {
    case 'x':
      return 'https://twitter.com/intent/tweet?text=' + message
    case 'facebook':
      return 'https://www.facebook.com/sharer/sharer.php?u=' + url + '&quote=' + message
    case 'linkedin':
      return 'https://www.linkedin.com/feed/?shareActive=true'
    case 'threads':
      return 'https://www.threads.net/intent/post?text=' + message
    case 'bluesky':
      return 'https://bsky.app/intent/compose?text=' + message
    case 'reddit':
      return 'https://www.reddit.com/submit?title=' + heading + '&selftext=' + message
    case 'whatsapp':
      return 'https://wa.me/?text=' + message
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
