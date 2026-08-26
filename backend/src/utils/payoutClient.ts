import crypto from 'crypto';

export interface PayoutInitiation {
  providerReferenceId: string;
}

export interface PayoutOutcome {
  status: 'success' | 'failed';
  failureReason: string | null;
}

/**
 * MOCK payout provider standing in for a real one (Cashfree/RazorpayX
 * Payouts). Real payout APIs require a registered business PAN to get even
 * sandbox access -- signing up mid-project hit that wall directly, so this
 * simulates the same two-step async shape (initiate -> provider reference id
 * immediately, settlement outcome later) a real integration would have.
 *
 * Swap initiatePayout()/simulatePayoutOutcome() for real SDK calls once
 * business KYC is complete; callers (routes/disbursements.ts) only depend on
 * this module's exported functions, not on anything being mocked.
 */
export async function initiatePayout(): Promise<PayoutInitiation> {
  return { providerReferenceId: `MOCK-${crypto.randomBytes(6).toString('hex').toUpperCase()}` };
}

/**
 * Simulates the provider's async settlement delay and outcome. A real
 * integration would instead receive this via a webhook some time after
 * initiatePayout() returns -- simulated here with a short delay so the
 * "processing" state is genuinely observable, not instant.
 */
export async function simulatePayoutOutcome(): Promise<PayoutOutcome> {
  await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 2000));

  // ~90% success rate -- realistic enough to exercise both the happy path
  // and the "funds never arrived, cannot be verified" path in demos/tests.
  const succeeded = Math.random() < 0.9;
  return succeeded
    ? { status: 'success', failureReason: null }
    : { status: 'failed', failureReason: 'Mock provider: simulated bank rejection (invalid account or insufficient float)' };
}
