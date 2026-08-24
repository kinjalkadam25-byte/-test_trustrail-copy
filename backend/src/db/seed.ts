import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool, withTransaction } from './pool';
import { appendLedgerEntry } from '../utils/ledger';

const DEMO_PASSWORD = 'password123';

async function applySchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
  await pool.query(schemaSql);
  console.log('Schema applied (or already present).');
}

function code() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function upsertNgo(name: string, registrationNumber: string, description: string) {
  const existing = await pool.query('SELECT id FROM ngos WHERE name = $1', [name]);
  if (existing.rowCount && existing.rowCount > 0) return existing.rows[0].id as string;
  const inserted = await pool.query(
    'INSERT INTO ngos (name, registration_number, description) VALUES ($1, $2, $3) RETURNING id',
    [name, registrationNumber, description]
  );
  return inserted.rows[0].id as string;
}

async function upsertUser(name: string, email: string, role: string, ngoId: string | null, passwordHash: string) {
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rowCount && existing.rowCount > 0) return existing.rows[0].id as string;
  const inserted = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, ngo_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [name, email, passwordHash, role, ngoId]
  );
  return inserted.rows[0].id as string;
}

async function seedDonation(donorId: string, ngoId: string, amount: number) {
  const existing = await pool.query(
    'SELECT id FROM donations WHERE donor_id = $1 AND ngo_id = $2 AND amount = $3',
    [donorId, ngoId, amount]
  );
  if (existing.rowCount && existing.rowCount > 0) return existing.rows[0].id as string;

  // Uses the exact same appendLedgerEntry() the live /api/donations route uses,
  // so seeded rows hash identically and won't trip a false positive in
  // verifyChain() before anyone has actually tampered with anything.
  return withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO donations (donor_id, ngo_id, amount, remaining_amount, donation_code)
       VALUES ($1, $2, $3, $3, $4) RETURNING id`,
      [donorId, ngoId, amount, code()]
    );
    const donationId = inserted.rows[0].id as string;
    await appendLedgerEntry(client, 'donation', donationId, { donorId, ngoId, amount });
    return donationId;
  });
}

async function main() {
  await applySchema();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const ngo1 = await upsertNgo(
    'Asha Bal Foundation',
    'CSR-REG-10234',
    'Provides school supplies, meals, and tuition support for children in low-income communities.'
  );
  const ngo2 = await upsertNgo(
    'Clean Water Collective',
    'CSR-REG-88213',
    'Builds and maintains community water filtration systems in rural districts.'
  );
  const ngo3 = await upsertNgo(
    'KJ Somaiya',
    'CSR-REG-55019',
    'Supports education, healthcare, and community development initiatives.'
  );

  const platformAdmin = await upsertUser('Priya Admin', 'admin@trusttrail.dev', 'platform_admin', null, passwordHash);

  const ngo1Admin = await upsertUser('Rahul (Asha Bal Admin)', 'ngo1-admin@trusttrail.dev', 'ngo_admin', ngo1, passwordHash);
  const ngo2Admin = await upsertUser('Meera (Clean Water Admin)', 'ngo2-admin@trusttrail.dev', 'ngo_admin', ngo2, passwordHash);
  const ngo3Admin = await upsertUser('Kavita (KJ Somaiya Admin)', 'ngo3-admin@trusttrail.dev', 'ngo_admin', ngo3, passwordHash);

  const vendor1 = await upsertUser('Sunrise Stationery Supplies', 'vendor1@trusttrail.dev', 'vendor', ngo1, passwordHash);
  const vendor2 = await upsertUser('Borewell & Filtration Co.', 'vendor2@trusttrail.dev', 'vendor', ngo2, passwordHash);

  const donor1 = await upsertUser('Anita Donor', 'donor1@trusttrail.dev', 'donor', null, passwordHash);
  const donor2 = await upsertUser('Vikram Donor', 'donor2@trusttrail.dev', 'donor', null, passwordHash);
  const donor3 = await upsertUser('Sana Donor', 'donor3@trusttrail.dev', 'donor', null, passwordHash);

  // Seed a few donations so FIFO allocation has something to draw from immediately.
  await seedDonation(donor1, ngo1, 20000);
  await seedDonation(donor2, ngo1, 15000);
  await seedDonation(donor3, ngo1, 25000);
  await seedDonation(donor1, ngo2, 30000);
  await seedDonation(donor2, ngo2, 10000);

  console.log('\nSeed complete. Demo accounts (all share one password):\n');
  console.log(`  password: ${DEMO_PASSWORD}\n`);
  console.log('  platform_admin  admin@trusttrail.dev');
  console.log(`  ngo_admin       ngo1-admin@trusttrail.dev   (${'Asha Bal Foundation'})`);
  console.log(`  ngo_admin       ngo2-admin@trusttrail.dev   (${'Clean Water Collective'})`);
  console.log(`  ngo_admin       ngo3-admin@trusttrail.dev   (${'KJ Somaiya'})`);
  console.log('  vendor          vendor1@trusttrail.dev      (assigned to Asha Bal Foundation)');
  console.log('  vendor          vendor2@trusttrail.dev      (assigned to Clean Water Collective)');
  console.log('  donor           donor1@trusttrail.dev / donor2@trusttrail.dev / donor3@trusttrail.dev');
  console.log('\nAsha Bal Foundation has 3 unallocated donations (₹20k/₹15k/₹25k) ready for the FIFO demo.\n');

  // touch unused var to avoid TS "declared but never read" noise in some configs
  void platformAdmin;
  void ngo1Admin;
  void ngo2Admin;
  void ngo3Admin;
  void vendor1;
  void vendor2;

  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
