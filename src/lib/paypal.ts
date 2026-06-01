// All PayPal API calls go through this file — never call PayPal endpoints directly from routes or actions

export type PayPalCapture = {
  id: string
  status: string
  purchase_units: Array<{
    payments: {
      captures: Array<{ id: string; status: string; amount: { currency_code: string; value: string } }>
    }
  }>
}

export class PayPalApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'PayPalApiError'
  }
}

async function getAccessToken(): Promise<string> {
  const clientId = requireEnv('PAYPAL_CLIENT_ID')
  const secret = requireEnv('PAYPAL_SECRET')
  const baseUrl = requireEnv('PAYPAL_BASE_URL')
  const credentials = Buffer.from(`${clientId}:${secret}`).toString('base64')

  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new PayPalApiError('Failed to get PayPal access token', res.status)
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

export async function createPayPalOrder(
  amount: string,
  jobId: string,
  returnUrl: string,
  cancelUrl: string,
): Promise<{ orderId: string; approveUrl: string }> {
  const baseUrl = requireEnv('PAYPAL_BASE_URL')
  const token = await getAccessToken()

  const res = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{ amount: { currency_code: 'USD', value: amount }, custom_id: jobId }],
      application_context: {
        return_url: returnUrl,
        cancel_url: cancelUrl,
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
      },
    }),
  })
  if (!res.ok) {
    try { console.error('PayPal create order error body:', await res.json()) } catch {}
    throw new PayPalApiError('Failed to create PayPal order', res.status)
  }

  const data = (await res.json()) as { id: string; links: Array<{ href: string; rel: string }> }
  const approveUrl = data.links.find((l) => l.rel === 'approve')?.href
  if (!approveUrl) throw new PayPalApiError('No approve link in PayPal response', 500)

  return { orderId: data.id, approveUrl }
}

export async function capturePayPalOrder(orderId: string): Promise<PayPalCapture> {
  const baseUrl = requireEnv('PAYPAL_BASE_URL')
  const token = await getAccessToken()

  const res = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new PayPalApiError('Failed to capture PayPal order', res.status)

  return res.json() as Promise<PayPalCapture>
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}
