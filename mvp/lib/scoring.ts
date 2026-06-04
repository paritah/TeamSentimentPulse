export type RiskLevel = "green" | "yellow" | "red";

export type PulseScores = {
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  q5: number;
  q6: number;
  q7: number;
};

export function normalizeScore(value: number): number {
  return ((value - 1) / 9) * 100;
}

export function compositeScore(scores: PulseScores): number {
  const total =
    normalizeScore(scores.q1) * 0.4 +
    normalizeScore(scores.q2) * 0.25 +
    normalizeScore(scores.q3) * 0.2 +
    normalizeScore(scores.q4) * 0.1 +
    normalizeScore(scores.q7) * 0.05;
  return Math.round(total);
}

export function riskLevelForComposite(composite: number): RiskLevel {
  if (composite >= 70) return "green";
  if (composite >= 40) return "yellow";
  return "red";
}

export function disengagementScore(
  composite: number,
  cyclesBelow4Count: number,
  lowRecommendationFlag: boolean,
): number {
  const score =
    (100 - composite) * 0.6 +
    cyclesBelow4Count * 8 +
    (lowRecommendationFlag ? 15 : 0);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function recommendationBucket(value: number): "low" | "moderate" | "high" {
  if (value <= 6) return "low";
  if (value <= 8) return "moderate";
  return "high";
}

export function recommendationNetScore(values: number[]): number {
  if (values.length === 0) return 0;
  const promoters = values.filter((v) => v >= 9).length;
  const detractors = values.filter((v) => v <= 6).length;
  const promoterPct = (promoters / values.length) * 100;
  const detractorPct = (detractors / values.length) * 100;
  return Math.round(promoterPct - detractorPct);
}
