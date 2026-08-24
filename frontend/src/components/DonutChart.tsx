interface DonutChartProps {
  verifiedAmount: number;
  pendingAmount: number;
}

// Hand-rolled SVG donut — deliberately no chart library, matching the project's
// "no CDN, no extra packages, docker-compose up must work offline" constraint.
export default function DonutChart({ verifiedAmount, pendingAmount }: DonutChartProps) {
  const total = verifiedAmount + pendingAmount;
  const verifiedPct = total > 0 ? (verifiedAmount / total) * 100 : 0;

  const radius = 70;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * radius;
  const verifiedLength = (verifiedPct / 100) * circumference;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
      <svg width="180" height="180" viewBox="0 0 180 180">
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke="var(--pending-tint)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke="var(--verified)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${verifiedLength} ${circumference}`}
          strokeLinecap="round"
          transform="rotate(-90 90 90)"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
        <text
          x="90"
          y="86"
          textAnchor="middle"
          fontSize="28"
          fontWeight="700"
          fill="var(--ink)"
          fontFamily="var(--font-display)"
        >
          {Math.round(verifiedPct)}%
        </text>
        <text x="90" y="106" textAnchor="middle" fontSize="12" fill="var(--ink-soft)">
          verified
        </text>
      </svg>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--verified)', display: 'inline-block' }} />
            Verified
          </span>
          <span>₹{verifiedAmount.toLocaleString('en-IN')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--pending)', display: 'inline-block' }} />
            Pending
          </span>
          <span>₹{pendingAmount.toLocaleString('en-IN')}</span>
        </div>
      </div>
    </div>
  );
}
