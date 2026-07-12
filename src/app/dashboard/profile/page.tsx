import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { ProfileForm } from './profile-form'
import { PayoutForm } from './payout-form'
import { PublicProfileLink } from './public-profile-link'

export default async function ProfilePage() {
  const session = await auth()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, phone: true },
  })
  if (!user) redirect('/login')

  const profile =
    session.user.role === 'PROVIDER'
      ? await db.providerProfile.findUnique({
          where: { userId: session.user.id },
          select: {
            bio: true, skills: true, isRemote: true,
            address: true, latitude: true, longitude: true,
            slug: true, showPhone: true,
            payoutMethod: true, paypalEmail: true, tkieroAccount: true,
          },
        })
      : null

  return (
    <div className="motion-section max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="motion-reveal text-headline-lg-mobile text-primary">Mi perfil</h1>
        <p className="text-body-md text-on-surface-variant mt-1">
          Tu información personal{profile ? ' y tu método de cobro' : ''}.
        </p>
      </div>

      <ProfileForm
        role={session.user.role}
        initial={{
          name: user.name,
          phone: user.phone ?? '',
          bio: profile?.bio ?? '',
          skills: profile?.skills ?? [],
          isRemote: profile?.isRemote ?? false,
          address: profile?.address ?? '',
          latitude: profile?.latitude ?? null,
          longitude: profile?.longitude ?? null,
          showPhone: profile?.showPhone ?? false,
        }}
      />

      {profile && (
        <PublicProfileLink
          url={`${(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/['"]/g, '').trimEnd()}/providers/${profile.slug}`}
        />
      )}

      {profile && (
        <PayoutForm
          initial={{
            payoutMethod: profile.payoutMethod,
            paypalEmail: profile.paypalEmail ?? '',
            tkieroAccount: profile.tkieroAccount ?? '',
          }}
        />
      )}
    </div>
  )
}
