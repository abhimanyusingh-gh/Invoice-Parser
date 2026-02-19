export const ConfidenceTones = ["red", "yellow", "green"] as const;

export type ConfidenceTone = (typeof ConfidenceTones)[number];

export const RiskFlags = ["TOTAL_AMOUNT_ABOVE_EXPECTED", "DUE_DATE_TOO_FAR"] as const;

export type RiskFlag = (typeof RiskFlags)[number];
