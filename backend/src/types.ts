export type Role = 'donor' | 'ngo_admin' | 'vendor' | 'platform_admin';

export type DisbursementStatus = 'pending_bill' | 'pending_review' | 'verified' | 'under_review';

export type LedgerEntryType = 'donation' | 'allocation' | 'disbursement' | 'bill_upload' | 'verification' | 'payout';

export type PayoutStatus = 'processing' | 'success' | 'failed';

export interface JwtPayload {
  userId: string;
  role: Role;
  ngoId: string | null;
}

// Augment Express's Request type with the fields authMiddleware attaches.
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export interface FeatureVector {
  amount: number;
  days_since_donation: number;
  ngo_avg_verification_time: number;
  ngo_pending_ratio: number;
  is_round_number: boolean;
  hour_of_day: number;
}

export interface AnomalyResult {
  score: number;
  isAnomalous: boolean;
  reason: string;
}

export interface OcrResult {
  extractedAmount: number | null;
  vendorName: string | null;
  date: string | null;
  confidence: 'high' | 'low' | 'none';
}
