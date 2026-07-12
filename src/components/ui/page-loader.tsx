export function PageLoader() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="page-loader flex flex-col items-center justify-center gap-5"
    >
      <div className="relative h-12 w-12">
        <div className="absolute inset-0 rounded-full border-4 border-primary-container" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" />
      </div>
      <span className="font-display font-bold text-lg text-primary animate-pulse">
        ServiLocal
      </span>
      <span className="sr-only">Cargando…</span>
    </div>
  )
}
