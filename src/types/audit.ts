export type Severity = "HIGH" | "MEDIUM" | "LOW";

export type Hazard = {
  item: string;
  severity: Severity;
  description: string;
};

export type FocusArea = {
  label: string;
  severity: Severity;
  x: number;
  y: number;
  width: number;
  height: number;
  note: string;
};

export type AuditResult = {
  safetyScore: number;
  environmentStatus: string;
  executiveSummary: string;
  hazards: Hazard[];
  focusAreas: FocusArea[];
  actionPlan: string[];
  ppeCompliance: string;
  positives: string[];
  confidence: number;
  timestamp: string;
  uncertainty?: number;
  moreInfoNeeded?: string[];
  annSummary?: string;
  predictedScene?: string;
  precisionScore?: number;
  ensembleVotes?: Record<string, number>;
};

export type StoredAudit = {
  id: string;
  fileName: string;
  previewUrl: string;
  result: AuditResult;
};
