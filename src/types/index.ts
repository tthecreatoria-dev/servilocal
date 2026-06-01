// src/types/index.ts
export type UserRole = 'CLIENT' | 'PROVIDER' | 'ADMIN'

export type ServiceCategory =
  | 'PLUMBING'
  | 'TEACHING'
  | 'DELIVERY'
  | 'CLEANING'
  | 'DESIGN'
  | 'DIGITAL'

export type TransactionStatus =
  | 'PENDING'
  | 'HELD'
  | 'RELEASED'
  | 'DISPUTED'
  | 'REFUNDED'

export type ServiceRequestStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'

export type JobPostStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'

export type JobApplicationStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'

export type CommissionResult = {
  commissionAmount: number
  rate: number
  providerAmount: number
}

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }
