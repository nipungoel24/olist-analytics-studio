'use client'

import { MorphIcon, type IconInput } from 'morphicons/react'

const PIN_SVG: IconInput = [
  ['path', { d: 'M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2z' }],
]

const REFRESH_SVG: IconInput = [
  ['path', { d: 'M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z' }],
]

interface IconProps {
  size?: number
  className?: string
  label?: string
}

export function PinIcon({ size = 20, className, label }: IconProps) {
  return (
    <MorphIcon
      icon={PIN_SVG}
      size={size}
      className={className}
      label={label}
      reducedMotion="user"
      color="currentColor"
      strokeWidth={2}
    />
  )
}

export function RefreshIcon({ size = 20, className, label }: IconProps) {
  return (
    <MorphIcon
      icon={REFRESH_SVG}
      size={size}
      className={className}
      label={label}
      reducedMotion="user"
      color="currentColor"
      strokeWidth={2}
    />
  )
}
