/**
 * QuorlythBot's compact head mark. The silhouette follows the head from the
 * existing 3D robot: warm orange shell, dark glass face, illuminated eyes,
 * side caps and a restrained orbital halo.
 */
import { useId } from 'react'

export function QuorlythBotHead({ size = 38 }: { size?: number }) {
  const uid = useId().replace(/:/g, '')
  const shell = `qbhead-shell-${uid}`
  const face = `qbhead-face-${uid}`
  const ear = `qbhead-ear-${uid}`
  const eye = `qbhead-eye-${uid}`
  const orbit = `qbhead-orbit-${uid}`
  const shadow = `qbhead-shadow-${uid}`
  return (
    <svg
      className="qbot-head-mark"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={shell} x1="13" y1="12" x2="49" y2="55" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F3A17C" />
          <stop offset=".3" stopColor="#E1835C" />
          <stop offset=".72" stopColor="#D06A40" />
          <stop offset="1" stopColor="#934127" />
        </linearGradient>
        <linearGradient id={face} x1="15" y1="23" x2="49" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#44302A" />
          <stop offset=".48" stopColor="#211A17" />
          <stop offset="1" stopColor="#100D0C" />
        </linearGradient>
        <linearGradient id={ear} x1="8" y1="28" x2="16" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E58A67" />
          <stop offset=".55" stopColor="#D06A40" />
          <stop offset="1" stopColor="#843A25" />
        </linearGradient>
        <radialGradient id={eye} cx="0" cy="0" r="1" gradientTransform="matrix(0 5 -3.5 0 0 0)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF8EF" />
          <stop offset=".48" stopColor="#F8CBB7" />
          <stop offset="1" stopColor="#E58A67" />
        </radialGradient>
        <linearGradient id={orbit} x1="9" y1="18" x2="56" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#843A25" stopOpacity=".2" />
          <stop offset=".48" stopColor="#F2AF91" />
          <stop offset="1" stopColor="#D06A40" stopOpacity=".35" />
        </linearGradient>
        <filter id={shadow} x="2" y="5" width="60" height="58" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>

      <ellipse cx="32" cy="32" rx="22.5" ry="20.5" fill="#843A25" opacity=".22" filter={`url(#${shadow})`} />
      <ellipse cx="32" cy="22.5" rx="22.5" ry="7.3" transform="rotate(-13 32 22.5)" stroke={`url(#${orbit})`} strokeWidth="2.2" opacity=".95" />
      <path d="M13.8 19.6C22.4 12.2 42 10.1 51.7 18" stroke="#F2BFA7" strokeWidth="1.1" strokeLinecap="round" opacity=".6" />

      <g>
        <rect x="6.8" y="29.4" width="9.5" height="15.7" rx="4.7" fill="#843A25" />
        <rect x="8" y="29.1" width="7.8" height="13.8" rx="3.9" fill={`url(#${ear})`} stroke="#F2AF91" strokeWidth=".7" />
        <rect x="47.7" y="29.4" width="9.5" height="15.7" rx="4.7" fill="#843A25" />
        <rect x="48.2" y="29.1" width="7.8" height="13.8" rx="3.9" fill={`url(#${ear})`} stroke="#F2AF91" strokeWidth=".7" />
        <path d="M10.1 32.5v6.6M53.9 32.5v6.6" stroke="#F8CBB7" strokeWidth="1.2" strokeLinecap="round" opacity=".8" />
      </g>

      <path d="M12.7 33.5c0-12.1 8.6-22.1 19.3-22.1s19.3 10 19.3 22.1v.8c0 11.8-8.6 20-19.3 20s-19.3-8.2-19.3-20z" fill="#843A25" />
      <path d="M13.7 32.8c0-11.6 8.1-20.5 18.3-20.5s18.3 8.9 18.3 20.5v1.1c0 11-8.1 18.9-18.3 18.9s-18.3-7.9-18.3-18.9z" fill={`url(#${shell})`} stroke="#F2AF91" strokeWidth=".8" />
      <path d="M18.4 22.1c3.6-5.2 8.4-7.4 13.6-7.4" stroke="#F9E1D5" strokeWidth="2" strokeLinecap="round" opacity=".55" />
      <path d="M14.8 31.5c3.5-5.5 9.5-8.7 17.2-8.7s13.7 3.2 17.2 8.7v5.6c-2.7 7.5-8.8 11.8-17.2 11.8S17.5 44.6 14.8 37.1z" fill={`url(#${face})`} stroke="#974329" strokeWidth=".8" />
      <path d="M18.3 29.9c3.7-3.1 8.1-4.6 13.7-4.6s10 1.5 13.7 4.6" stroke="#FFFFFF" strokeWidth="1" strokeLinecap="round" opacity=".12" />

      <ellipse cx="25.1" cy="32.5" rx="2.2" ry="3.7" fill="#843A25" opacity=".55" />
      <ellipse cx="38.9" cy="32.5" rx="2.2" ry="3.7" fill="#843A25" opacity=".55" />
      <ellipse cx="25.1" cy="32" rx="1.65" ry="3" fill={`url(#${eye})`} />
      <ellipse cx="38.9" cy="32" rx="1.65" ry="3" fill={`url(#${eye})`} />
      <path d="M24.5 30.7v1.5M38.3 30.7v1.5" stroke="#FFFFFF" strokeWidth=".8" strokeLinecap="round" opacity=".9" />

      <g fill="#E58A67">
        <rect x="27.2" y="40.2" width="1.5" height="3.4" rx=".7" />
        <rect x="30.1" y="39.7" width="1.5" height="4.1" rx=".7" />
        <rect x="33" y="39.4" width="1.5" height="4.4" rx=".7" />
        <rect x="35.9" y="39.7" width="1.5" height="4.1" rx=".7" />
      </g>
      <path d="M25.3 47.1c4.1 1.6 9.3 1.6 13.4 0" stroke="#F2AF91" strokeWidth=".8" strokeLinecap="round" opacity=".45" />
      <path d="M16.5 43.9c2.4 5.5 8.2 9.2 15.5 9.2s13.1-3.7 15.5-9.2" stroke="#843A25" strokeWidth="1" opacity=".35" />
      <ellipse cx="32" cy="22.5" rx="18.2" ry="5.7" transform="rotate(-13 32 22.5)" stroke="#FFE0C7" strokeWidth=".7" opacity=".42" />
    </svg>
  )
}
