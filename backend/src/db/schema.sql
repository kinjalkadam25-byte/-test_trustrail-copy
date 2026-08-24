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
  verification_code  VARCHAR(20) UNIQUE NOT NULL,
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
  entry_type     VARCHAR(20) NOT NULL CHECK (entry_type IN ('donation','allocation','disbursement','bill_upload')),
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
