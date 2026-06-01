import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div>
      <h1 className="text-2xl font-semibold">Welcome, {session.user.name}</h1>
      <p className="mt-2 text-zinc-500">Dashboard features coming soon.</p>
    </div>
  )
}
