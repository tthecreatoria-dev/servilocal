export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  return words
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

export function InitialsAvatar({
  name,
  sizeClass = 'w-12 h-12 text-label-md',
}: {
  name: string
  sizeClass?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded-full bg-primary-container text-on-primary-container shrink-0 select-none ${sizeClass}`}
    >
      {getInitials(name)}
    </span>
  )
}
