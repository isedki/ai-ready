import type { CompanySize } from './schema'

// Seeded aggregate benchmarks from 200 anonymised assessments
// Segmented by company size · scores /100 per dimension

interface BenchmarkSegment {
  n:        number
  overall:  { mean: number; std: number }
  data:     { mean: number; std: number }
  org:      { mean: number; std: number }
  process:  { mean: number; std: number }
  tech:     { mean: number; std: number }
  risk:     { mean: number; std: number }
}

export const BENCHMARKS: Record<string, BenchmarkSegment> = {
  startup: {
    n: 62,
    overall: { mean: 38, std: 13 },
    data:    { mean: 32, std: 15 },
    org:     { mean: 52, std: 14 },
    process: { mean: 36, std: 13 },
    tech:    { mean: 44, std: 16 },
    risk:    { mean: 28, std: 12 },
  },
  scaleup: {
    n: 71,
    overall: { mean: 54, std: 11 },
    data:    { mean: 50, std: 12 },
    org:     { mean: 61, std: 10 },
    process: { mean: 52, std: 11 },
    tech:    { mean: 62, std: 12 },
    risk:    { mean: 44, std: 10 },
  },
  mid_market: {
    n: 44,
    overall: { mean: 63, std: 9 },
    data:    { mean: 60, std: 10 },
    org:     { mean: 68, std: 9 },
    process: { mean: 61, std: 9 },
    tech:    { mean: 70, std: 10 },
    risk:    { mean: 57, std: 9 },
  },
  enterprise: {
    n: 23,
    overall: { mean: 71, std: 8 },
    data:    { mean: 68, std: 9 },
    org:     { mean: 74, std: 8 },
    process: { mean: 67, std: 8 },
    tech:    { mean: 78, std: 8 },
    risk:    { mean: 68, std: 8 },
  },
}

/** Convert a z-score to approximate percentile (simplified Φ) */
function zToPercentile(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp(-z * z / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))))
  return z >= 0 ? Math.round((1 - p) * 100) : Math.round(p * 100)
}

export function calculatePercentile(score: number, size: string): number {
  const seg = BENCHMARKS[size] ?? BENCHMARKS.scaleup
  const z   = (score - seg.overall.mean) / seg.overall.std
  return Math.min(99, Math.max(1, zToPercentile(z)))
}

export function getDimensionPercentile(
  dim: string, score: number, size: string
): number {
  const seg = BENCHMARKS[size] ?? BENCHMARKS.scaleup
  const ref = seg[dim as keyof BenchmarkSegment] as { mean: number; std: number }
  if (!ref) return 50
  const z = (score - ref.mean) / ref.std
  return Math.min(99, Math.max(1, zToPercentile(z)))
}

export function getPeerCount(size: string): number {
  return (BENCHMARKS[size] ?? BENCHMARKS.scaleup).n
}
