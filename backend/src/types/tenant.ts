export const WorkloadTiers = ["standard", "heavy"] as const;

export type WorkloadTier = (typeof WorkloadTiers)[number];
