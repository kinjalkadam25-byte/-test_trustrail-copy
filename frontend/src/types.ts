export type Role = 'donor' | 'ngo_admin' | 'vendor' | 'platform_admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  ngoId: string | null;
}

export type DisbursementStatus = 'pending_bill' | 'pending_review' | 'verified' | 'under_review';

export interface Ngo {
  id: string;
  name: string;
  registrationNumber?: string | null;
  description?: string | null;
}

export interface Donation {
  id: string;
  ngoId: string;
  ngoName?: string;
  amount: string | number;
  remainingAmount: string | number;
  donationCode: string;
  createdAt: string;
}

export interface DisbursementSummary {
  id: string;
  amount: string | number;
  purpose: string;
  category: string | null;
  status: DisbursementStatus;
  verificationCode?: string;
}

export interface Allocation {
  amountAllocated: string | number;
  disbursement: DisbursementSummary & { createdAt: string };
}

export interface AnomalyFlagSummary {
  isAnomalous: boolean;
  reason: string;
  reviewStatus: 'unreviewed' | 'confirmed_ok' | 'confirmed_issue';
}

export interface NgoDisbursementRow {
  disbursement: DisbursementSummary & {
    underfunded: boolean;
    vendorId: string | null;
    vendorName: string | null;
    createdAt: string;
  };
  flagStatus: AnomalyFlagSummary | null;
}

export interface NgoDashboard {
  totalDonations: number;
  totalDisbursed: number;
  verifiedPct: number;
  avgVerificationTime: number | null;
  pendingCount: number;
}

export interface VendorDisbursement {
  id: string;
  ngoName: string;
  amount: string | number;
  purpose: string;
  category: string | null;
  status: DisbursementStatus;
  verificationCode: string;
  createdAt: string;
}

export interface VerifyResponse {
  disbursement: {
    id: string;
    ngoName: string;
    amount: string | number;
    purpose: string;
    category: string | null;
    status: DisbursementStatus;
    underfunded: boolean;
    createdAt: string;
  };
  bill: {
    amountClaimed: string | number;
    mimeType: string;
    fileBase64: string;
    uploadedAt: string;
  } | null;
  amountMatch: boolean | null;
}

export interface AdminFlagRow {
  anomalyFlag: {
    id: string;
    score: string | number;
    isAnomalous: boolean;
    reason: string;
    reviewStatus: 'unreviewed' | 'confirmed_ok' | 'confirmed_issue';
    flaggedAt: string;
  };
  disbursement: {
    id: string;
    ngoName: string;
    amount: string | number;
    purpose: string;
    category: string | null;
    verificationCode: string;
    status: DisbursementStatus;
  };
}

export interface LedgerVerifyResult {
  valid: boolean;
  // BIGSERIAL id, returned as a string by pg — see backend/src/utils/ledger.ts
  brokenAtEntryId?: string;
  reason?: string;
  entriesChecked: number;
}

export interface TrustScore {
  trustScore: number;
  verifiedPct: number;
  avgVerificationTime: number | null;
  cached?: boolean;
}
