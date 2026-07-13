import type { Metadata } from 'next'
import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Iniciar sesión',
  robots: { index: false, follow: true },
}

export default async function LoginPage({
                                            searchParams,
                                        }: {
    searchParams: Promise<{ callbackUrl?: string }>
}) {
    const { callbackUrl } = await searchParams
    return <LoginForm callbackUrl={callbackUrl ?? ''} />
}
