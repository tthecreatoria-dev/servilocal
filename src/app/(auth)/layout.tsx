import { LanguageToggle } from '@/components/ui/language-toggle'
import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-background py-8 px-4 sm:py-12">
      <div className="absolute top-4 left-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-label-md text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Inicio
        </Link>
      </div>
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-[480px]">{children}</div>
    </div>
  )
}
