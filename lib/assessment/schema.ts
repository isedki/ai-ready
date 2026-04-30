import { z } from 'zod'

export const CompanySize = z.enum(['startup', 'scaleup', 'mid_market', 'enterprise'])
export const AIStage     = z.enum(['exploring', 'piloting', 'scaling', 'optimizing'])
export const Dimension   = z.enum(['data', 'org', 'process', 'tech', 'risk'])
export const Confidence  = z.enum(['low', 'medium', 'high'])
export const Timeline    = z.enum(['ready', '3_months', '6_months', '12_months', '18_plus'])
export const Tier        = z.enum(['not_ready', 'foundations', 'emerging', 'ready', 'leading'])

export const CompanyProfile = z.object({
  name:     z.string().optional(),
  size:     CompanySize,
  industry: z.string(),
  stage:    AIStage,
})

export const DimensionScore = z.object({
  dimension:       Dimension,
  score:           z.number().min(0).max(100),
  confidence:      Confidence,
  evidence_based:  z.boolean(),
  key_gaps:        z.array(z.string()).max(3),
  key_strengths:   z.array(z.string()).max(2),
  timeline:        Timeline,
})

export const AssessmentResult = z.object({
  company:              CompanyProfile,
  dimensions:           z.array(DimensionScore).length(5),
  overall_score:        z.number().min(0).max(100),
  tier:                 Tier,
  top_blockers:         z.array(z.string()).min(1).max(3),
  quick_wins:           z.array(z.string()).min(1).max(3),
  time_to_production:   z.string(),
  benchmark_percentile: z.number().min(1).max(99),
  exec_headline:        z.string(),   // 1-sentence CEO summary
  exec_narrative:       z.string(),   // 2-3 paragraph exec brief
})

export type CompanyProfile   = z.infer<typeof CompanyProfile>
export type DimensionScore   = z.infer<typeof DimensionScore>
export type AssessmentResult = z.infer<typeof AssessmentResult>
export type DimensionKey     = z.infer<typeof Dimension>
