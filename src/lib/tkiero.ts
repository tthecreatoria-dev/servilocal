// src/lib/tkiero.ts
import axios, { type AxiosInstance, isAxiosError } from 'axios'

export type PaymentMetadata =
  | { jobPostId: string; clientId: string; serviceRequestId?: never; providerId?: never; category?: never }
  | { serviceRequestId: string; clientId: string; providerId: string; category: string; jobPostId?: never }

export type TkieroPayment = {
  id: string
  amount: number
  currency: 'USD'
  status: 'PENDING' | 'CONFIRMED' | 'RELEASED' | 'REFUNDED'
  qrCodeUrl?: string
  metadata: PaymentMetadata
  createdAt: string
}

export type TkieroReleaseResult = {
  success: boolean
  transactionId: string
  amount: number
  providerId: string
}

export type TkieroRefundResult = {
  success: boolean
  refundId: string
  originalPaymentId: string
}

export class TkieroApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'TkieroApiError'
  }
}

export class TkieroClient {
  private readonly http: AxiosInstance

  constructor(
    apiKey: string,
    baseUrl: string,
    httpClient?: AxiosInstance,
  ) {
    this.http =
      httpClient ??
      axios.create({
        baseURL: baseUrl,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      })
  }

  async createPayment(
    amount: number,
    currency: 'USD',
    metadata: PaymentMetadata,
  ): Promise<TkieroPayment> {
    try {
      const { data } = await this.http.post<TkieroPayment>('/payments', {
        amount,
        currency,
        metadata,
      })
      return data
    } catch (err) {
      throw this.wrapError(err)
    }
  }

  async verifyPayment(paymentId: string): Promise<TkieroPayment> {
    try {
      const { data } = await this.http.get<TkieroPayment>(`/payments/${paymentId}`)
      return data
    } catch (err) {
      throw this.wrapError(err)
    }
  }

  async releaseToProvider(
    paymentId: string,
    providerId: string,
    amount: number,
  ): Promise<TkieroReleaseResult> {
    try {
      const { data } = await this.http.post<TkieroReleaseResult>(
        `/payments/${paymentId}/release`,
        { providerId, amount },
      )
      return data
    } catch (err) {
      throw this.wrapError(err)
    }
  }

  async refund(paymentId: string, reason: string): Promise<TkieroRefundResult> {
    try {
      const { data } = await this.http.post<TkieroRefundResult>(
        `/payments/${paymentId}/refund`,
        { reason },
      )
      return data
    } catch (err) {
      throw this.wrapError(err)
    }
  }

  private wrapError(err: unknown): TkieroApiError {
    if (isAxiosError(err) && err.response) {
      const { status, data } = err.response as {
        status: number
        data: { code: string; message: string }
      }
      return new TkieroApiError(data.message ?? 'Tkiero API error', data.code ?? 'UNKNOWN', status)
    }
    if (err instanceof Error) {
      return new TkieroApiError(err.message, 'NETWORK_ERROR', 0)
    }
    return new TkieroApiError('Unknown error', 'UNKNOWN', 0)
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

let _tkiero: TkieroClient | undefined

/**
 * Lazily-instantiated singleton. Throws at first use (not at import time) if
 * the required environment variables are absent. This allows the module to be
 * imported in tests that only use `TkieroClient` directly via constructor injection.
 */
export function getTkiero(): TkieroClient {
  if (!_tkiero) {
    _tkiero = new TkieroClient(
      requireEnv('TKIERO_API_KEY'),
      requireEnv('TKIERO_BASE_URL'),
    )
  }
  return _tkiero
}
