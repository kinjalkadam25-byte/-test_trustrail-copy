-- TrustTrail — full schema (9 tables)
-- Run automatically on first `docker-compose up` via the db init-scripts mount,
-- or manually with: psql -U trusttrail -d trusttrail -f schema.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- Users: covers all 4 roles in one table, differentiated by `role`
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL CHECK (role IN ('donor','ngo_admin','vendor','platform_admin')),
  ngo_id        UUID, -- populated for ngo_admin and vendor roles; FK added below (ngos created after users here, so we add it via ALTER)
  created_at    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ngos (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 VARCHAR(255) NOT NULL,
  registration_number  VARCHAR(100),
  description          TEXT,
  created_at           TIMESTAMP NOT NULL DEFAULT now()
);

-- users.ngo_id -> ngos.id (added after both tables exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'users_ngo_id_fkey'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_ngo_id_fkey FOREIGN KEY (ngo_id) REFERENCES ngos(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS donations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id          UUID NOT NULL REFERENCES users(id),
  ngo_id            UUID NOT NULL REFERENCES ngos(id),
  amount            NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  remaining_amount  NUMERIC(12,2) NOT NULL,   -- decreases as FIFO allocation consumes it
  donation_code     VARCHAR(20) UNIQUE NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS disbursements (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ngo_id             UUID NOT NULL REFERENCES ngos(id),
  vendor_id          UUID REFERENCES users(id),   -- nullable until a vendor is assigned
  amount             NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  purpose            VARCHAR(255) NOT NULL,
  category           VARCHAR(100),
  -- Nullable: only assigned once BOTH the bill/OCR check and the bank payout
  -- succeed (see utils/verification.ts's reconcileDisbursementStatus) -- not
  -- generated at creation time. GET /api/verify/:code is naturally
  -- unreachable for a disbursement until this exists, since there's nothing
  -- to look it up by.
  verification_code  VARCHAR(20) UNIQUE,
  status             VARCHAR(20) NOT NULL DEFAULT 'pending_bill'
                       CHECK (status IN ('pending_bill','pending_review','verified','under_review')),
  underfunded        BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMP NOT NULL DEFAULT now()
);

-- The many-to-many link that makes FIFO allocation traceable:
-- one donation can fund several disbursements, one disbursement can be funded by several donations.
CREATE TABLE IF NOT EXISTS allocations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donation_id       UUID NOT NULL REFERENCES donations(id),
  disbursement_id   UUID NOT NULL REFERENCES disbursements(id),
  amount_allocated  NUMERIC(12,2) NOT NULL CHECK (amount_allocated > 0),
  created_at        TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bills (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disbursement_id   UUID UNIQUE NOT NULL REFERENCES disbursements(id),  -- one bill per disbursement
  vendor_id         UUID NOT NULL REFERENCES users(id),
  file_data         BYTEA NOT NULL,          -- the uploaded receipt image, stored directly
  file_mime_type    VARCHAR(50) NOT NULL,
  amount_claimed    NUMERIC(12,2) NOT NULL,
  uploaded_at       TIMESTAMP NOT NULL DEFAULT now()
);

-- The tamper-evident hash chain. Every write to donations/allocations/disbursements/bills
-- also writes one row here.
CREATE TABLE IF NOT EXISTS ledger_entries (
  id             BIGSERIAL PRIMARY KEY,
  entry_type     VARCHAR(20) NOT NULL CHECK (entry_type IN ('donation','allocation','disbursement','bill_upload','verification','payout')),
  reference_id   UUID NOT NULL,       -- the id of the row in the source table this entry documents
  payload        JSONB NOT NULL,      -- a snapshot of the data at write time
  previous_hash  VARCHAR(64) NOT NULL,
  hash           VARCHAR(64) NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anomaly_flags (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disbursement_id UUID NOT NULL REFERENCES disbursements(id),
  score          NUMERIC NOT NULL,
  is_anomalous   BOOLEAN NOT NULL,
  reason         TEXT NOT NULL,
  review_status  VARCHAR(20) NOT NULL DEFAULT 'unreviewed'
                   CHECK (review_status IN ('unreviewed','confirmed_ok','confirmed_issue')),
  reviewed_by    UUID REFERENCES users(id),
  flagged_at     TIMESTAMP NOT NULL DEFAULT now()
);

-- One row per bill: what the OCR pass (Gemini vision, see ml-service/main.py's
-- /ocr/receipt) read off the actual receipt image, independent of whatever
-- amount_claimed the vendor typed -- an automated cross-check against
-- self-reported data, written asynchronously after the bill upload responds.
CREATE TABLE IF NOT EXISTS bill_ocr_results (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id           UUID UNIQUE NOT NULL REFERENCES bills(id),
  extracted_amount  NUMERIC(12,2),
  vendor_name       VARCHAR(255),
  receipt_date      DATE,
  confidence        VARCHAR(10) NOT NULL CHECK (confidence IN ('high','low','none')),
  amount_mismatch   BOOLEAN,   -- null until there's an extracted_amount to compare amount_claimed against
  created_at        TIMESTAMP NOT NULL DEFAULT now()
);

-- One row per vendor: the account funds are paid out to. Real bank-account
-- verification (confirming the account exists / holder name matches, via a
-- provider like Cashfree/RazorpayX) needs a registered business PAN to get
-- even sandbox payout-API access, which this project doesn't have -- so this
-- only validates account number / IFSC *format* server-side (see
-- routes/vendor.ts), it does not confirm the account is real.
CREATE TABLE IF NOT EXISTS vendor_bank_accounts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id            UUID UNIQUE NOT NULL REFERENCES users(id),
  account_number       VARCHAR(34) NOT NULL,
  ifsc_code            VARCHAR(11) NOT NULL,
  account_holder_name  VARCHAR(255) NOT NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT now()
);

-- One row per disbursement's payout attempt to its vendor's bank account.
-- `status` starts 'processing' and is settled by a MOCK payout provider (see
-- utils/payoutClient.ts) standing in for a real one -- same swap-later shape
-- as bill_ocr_results/mlClient.ts, but for money movement instead of an
-- optional signal: a disbursement can only reach 'verified' once its payout
-- here is 'success' (see utils/verification.ts's reconcileDisbursementStatus).
CREATE TABLE IF NOT EXISTS payouts (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disbursement_id        UUID UNIQUE NOT NULL REFERENCES disbursements(id),
  vendor_bank_account_id UUID NOT NULL REFERENCES vendor_bank_accounts(id),
  amount                 NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  status                 VARCHAR(20) NOT NULL DEFAULT 'processing'
                           CHECK (status IN ('processing','success','failed')),
  provider_reference_id  VARCHAR(64),
  failure_reason         TEXT,
  initiated_at           TIMESTAMP NOT NULL DEFAULT now(),
  completed_at           TIMESTAMP
);

-- Helpful indexes for the lookups the app actually does
CREATE INDEX IF NOT EXISTS idx_donations_ngo_remaining ON donations(ngo_id, created_at) WHERE remaining_amount > 0;
CREATE INDEX IF NOT EXISTS idx_donations_code ON donations(donation_code);
CREATE INDEX IF NOT EXISTS idx_disbursements_verification_code ON disbursements(verification_code);
CREATE INDEX IF NOT EXISTS idx_disbursements_ngo ON disbursements(ngo_id);
CREATE INDEX IF NOT EXISTS idx_disbursements_vendor ON disbursements(vendor_id);
CREATE INDEX IF NOT EXISTS idx_allocations_donation ON allocations(donation_id);
CREATE INDEX IF NOT EXISTS idx_allocations_disbursement ON allocations(disbursement_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_flags_disbursement ON anomaly_flags(disbursement_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_flags_review_status ON anomaly_flags(review_status);
CREATE INDEX IF NOT EXISTS idx_bill_ocr_results_bill ON bill_ocr_results(bill_id);
CREATE INDEX IF NOT EXISTS idx_payouts_disbursement ON payouts(disbursement_id);
