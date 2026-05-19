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

export type NoteIntent =
  | "immediate_action"
  | "clarify_context"
  | "equipment_status"
  | "chemical_safety"
  | "ppe_review"
  | "visibility_issue"
  | "housekeeping"
  | "scene_hint"
  | "incident_report"
  | "general_observation";

export type NoteUrgency = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type NoteAnalysis = {
  originalText: string;
  normalizedText: string;
  intent: NoteIntent;
  intentConfidence: number;
  urgency: NoteUrgency;
  detailScore: number;
  keyPhrases: string[];
  entities: string[];
  topics: string[];
  extractedActions: string[];
  followUpQuestions: string[];
  riskSignals: string[];
  evidencePoints?: string[];
  contradictions?: string[];
  reasoningTrail?: string[];
  ambiguityScore?: number;
  inferredPriority?: number;
  confidenceScore?: number;
  summary: string;
  sceneHint?: "general" | "unknown" | "workshop" | "lab" | "factory" | "warehouse" | "office" | "outdoor";
  shouldEscalate: boolean;
  noteWeight: number;
  riskBoost: number;
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
  noteAnalysis?: NoteAnalysis;
};

export type StoredAudit = {
  id: string;
  fileName: string;
  previewUrl: string;
  result: AuditResult;
};
