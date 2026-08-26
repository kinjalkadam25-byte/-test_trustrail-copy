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
  // Only exists once BOTH the bill/OCR check and the bank payout have
  // independently succeeded -- see backend/src/utils/verification.ts's
  // reconcileDisbursementStatus. Not assigned at creation time.
  verificationCode?: string | null;
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

export type PayoutStatus = 'processing' | 'success' | 'failed';

export interface NgoDisbursementRow {
  disbursement: DisbursementSummary & {
    underfunded: boolean;
    vendorId: string | null;
    vendorName: string | null;
    createdAt: string;
  };
  flagStatus: AnomalyFlagSummary | null;
  // Funds-moved leg of verification, alongside the bill/OCR leg -- see
  // backend/src/utils/verification.ts's reconcileDisbursementStatus. null
  // means no payout has ever been triggered (vendor had no bank account on
  // file yet when the disbursement was created).
  payoutStatus: PayoutStatus | null;
  payoutFailureReason: string | null;
  vendorHasBankAccount: boolean;
}

export interface VendorBankAccount {
  accountNumber: string;
  ifscCode: string;
  accountHolderName: string;
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
  verificationCode: string | null;
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
  // Independent of amountMatch above -- reads the actual receipt image via
  // OCR (see backend/src/routes/bills.ts) rather than trusting the vendor's
  // self-reported amountClaimed. Runs in the background after bill upload,
  // so this can be null for a few seconds on a freshly-uploaded bill.
  ocr: {
    extractedAmount: string | number | null;
    vendorName: string | null;
    date: string | null;
    confidence: 'high' | 'low' | 'none';
    amountMismatch: boolean | null;
  } | null;
  // Confirms funds actually moved to the vendor's bank account -- required
  // alongside the bill/OCR check above for 'verified' status. null means no
  // payout has been triggered yet.
  payout: {
    status: PayoutStatus;
    failureReason: string | null;
    completedAt: string | null;
  } | null;
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
    verificationCode: string | null;
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
