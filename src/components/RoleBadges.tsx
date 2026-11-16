import React from 'react'

type BadgeProps = { compact?: boolean }

export function PlatformAdminBadge({ compact = false }: BadgeProps) {
  return (
    <span
      className={compact ? 'platform-verified-shield platform-verified-shield--compact' : 'platform-verified-shield'}
      title="Verified Quorlyth platform administrator"
      aria-label="Verified Quorlyth platform administrator"
    >
      <svg className="platform-verified-shield__icon" viewBox="0 0 32 36" aria-hidden="true" focusable="false">
        <path className="platform-verified-shield__outline" d="M16 2 28 7v9c0 8-4.7 13.6-12 18C8.7 29.6 4 24 4 16V7z" />
        <path className="platform-verified-shield__check" d="m10 17 4 4 8-9" />
      </svg>
      <span className="platform-verified-shield__label">PLATFORM ADMIN</span>
      <i className="platform-verified-shield__glint" aria-hidden="true" />
    </span>
  )
}

export function CommunityCreatorBadge({ compact = false, label = 'COMMUNITY CREATOR' }: BadgeProps & { label?: string }) {
  return (
    <span
      className={compact ? 'community-creator-seal community-creator-seal--compact' : 'community-creator-seal'}
      title="Community creator"
      aria-label={label}
    >
      <svg className="community-creator-seal__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path className="community-creator-seal__branches" d="M12 8.5v3.2M12 11.7H6.3v3.1M12 11.7h5.7v3.1" />
        <circle className="community-creator-seal__origin" cx="12" cy="5.3" r="3.1" />
        <circle className="community-creator-seal__node" cx="6.3" cy="18" r="2.1" />
        <circle className="community-creator-seal__node" cx="17.7" cy="18" r="2.1" />
        <path className="community-creator-seal__base" d="M3.8 21h16.4" />
      </svg>
      <span className="community-creator-seal__label">{label}</span>
      <i className="community-creator-seal__glint" aria-hidden="true" />
    </span>
  )
}
