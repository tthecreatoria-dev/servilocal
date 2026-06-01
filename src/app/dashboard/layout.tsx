import { auth, signOut } from '@/lib/auth'
import Link from 'next/link'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const role = session?.user.role

  return (
    <div className="min-h-screen bg-surface">
      <nav className="bg-surface-container-lowest border-b border-outline-variant px-6 py-0">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="font-display font-bold text-lg text-primary py-4">
            ServiLocal
          </Link>
          <div className="flex items-center gap-1">
            {role === 'CLIENT' && (
              <Link
                href="/dashboard/jobs"
                className="flex items-center gap-1.5 px-3 py-4 text-label-md text-on-surface-variant hover:text-on-surface transition-colors border-b-2 border-transparent hover:border-primary"
              >
                <span className="material-symbols-outlined text-[18px]">work</span>
                Mis proyectos
              </Link>
            )}
            {role === 'PROVIDER' && (
              <Link
                href="/dashboard/applications"
                className="flex items-center gap-1.5 px-3 py-4 text-label-md text-on-surface-variant hover:text-on-surface transition-colors border-b-2 border-transparent hover:border-primary"
              >
                <span className="material-symbols-outlined text-[18px]">description</span>
                Mis propuestas
              </Link>
            )}
          </div>
          <form
            action={async () => {
              'use server'
              await signOut({ redirectTo: '/' })
            }}
          >
            <button
              type="submit"
              className="flex items-center gap-1.5 px-3 py-2 text-label-md text-on-surface-variant hover:text-on-surface transition-colors rounded-lg hover:bg-surface-variant"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
              <span className="hidden sm:inline">Salir</span>
            </button>
          </form>
        </div>
      </nav>
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
