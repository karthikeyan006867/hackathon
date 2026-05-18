import type { AuditResult, Hazard, NoteAnalysis, Severity } from "@/types/audit";

type EnrichmentContext = {
  inspectionMode: string;
  notes: string;
  fileName: string;
};

type HazardRule = {
  id: string;
  match: (note: NoteAnalysis | undefined, context: EnrichmentContext, result: AuditResult) => boolean;
  hazard: Hazard;
};

const HAZARD_RULES: HazardRule[] = [
  {
    id: "chemical-exposure",
    match: (note) => Boolean(note?.topics.includes("chemical")),
    hazard: {
      item: "Chemical Handling Verification",
      severity: "HIGH",
      description: "Supervisor notes indicate chemical context. Verify labels, spill containment, and fume extraction before operation.",
    },
  },
  {
    id: "ppe-gap",
    match: (note) => Boolean(note?.topics.includes("ppe") || note?.intent === "ppe_review"),
    hazard: {
      item: "PPE Compliance Gap",
      severity: "MEDIUM",
      description: "Context indicates PPE uncertainty. Confirm goggles, gloves, and task-specific protection at entry points.",
    },
  },
  {
    id: "equipment-lockout",
    match: (note) => Boolean(note?.topics.includes("equipment") || note?.intent === "equipment_status"),
    hazard: {
      item: "Machine Status Ambiguity",
      severity: "HIGH",
      description: "Equipment state is unclear from context. Confirm running vs lockout/tagout before maintenance or close-up inspection.",
    },
  },
  {
    id: "visibility-risk",
    match: (note) => Boolean(note?.topics.includes("visibility") || note?.intent === "visibility_issue"),
    hazard: {
      item: "Low Visual Certainty",
      severity: "MEDIUM",
      description: "Visibility concerns in notes can hide critical hazards. Re-capture with brighter, closer, and less occluded framing.",
    },
  },
  {
    id: "housekeeping-risk",
    match: (note) => Boolean(note?.topics.includes("housekeeping") || note?.intent === "housekeeping"),
    hazard: {
      item: "Housekeeping and Access Risk",
      severity: "MEDIUM",
      description: "Notes suggest clutter/blocked pathways. Clear access routes and secure loose materials before restart.",
    },
  },
  {
    id: "incident-escalation",
    match: (note) => Boolean(note?.shouldEscalate || note?.topics.includes("incident")),
    hazard: {
      item: "Incident Escalation Required",
      severity: "HIGH",
      description: "Supervisor notes indicate incident-level risk. Trigger immediate review, area isolation, and supervisor sign-off.",
    },
  },
  {
    id: "contradiction-ambiguity",
    match: (note) => Boolean((note?.contradictions?.length ?? 0) > 0 || (note?.ambiguityScore ?? 0) > 0.55),
    hazard: {
      item: "Context Ambiguity",
      severity: "MEDIUM",
      description: "The note contains missing detail or conflicting signals. Request sharper clarification before final sign-off.",
    },
  },
  {
    id: "priority-escalation",
    match: (note) => Boolean((note?.inferredPriority ?? 0) > 0.75 && (note?.detailScore ?? 0) > 0.35),
    hazard: {
      item: "High Priority Supervisor Signal",
      severity: "MEDIUM",
      description: "The note is both detailed and high-priority, so local enrichment should bias toward rapid review and tighter controls.",
    },
  },
];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function severityWeight(severity: Severity): number {
  if (severity === "HIGH") return 18;
  if (severity === "MEDIUM") return 10;
  return 4;
}

function sortHazards(hazards: Hazard[]): Hazard[] {
  const rank: Record<Severity, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  return [...hazards].sort((left, right) => {
    const severityDelta = rank[right.severity] - rank[left.severity];
    if (severityDelta !== 0) return severityDelta;
    return left.item.localeCompare(right.item);
  });
}

function uniqueByItem(hazards: Hazard[]): Hazard[] {
  const seen = new Set<string>();
  const output: Hazard[] = [];
  for (const hazard of hazards) {
    const key = hazard.item.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(hazard);
  }
  return output;
}

function buildLocalActions(result: AuditResult, context: EnrichmentContext): string[] {
  const note = result.noteAnalysis;
  const actions = [...result.actionPlan];

  if (note?.shouldEscalate) {
    actions.unshift("0. EMERGENCY ESCALATION: Pause operations, isolate zone, and perform supervisor-led revalidation before restart.");
  }

  if (note?.extractedActions?.length) {
    for (const [index, action] of note.extractedActions.slice(0, 2).entries()) {
      actions.push(`${actions.length + 1}. NOTE ACTION ${index + 1}: ${action}`);
    }
  }

  if (note?.followUpQuestions?.length) {
    actions.push(`${actions.length + 1}. CONTEXT CHECK: ${note.followUpQuestions[0]}`);
  }

  if (note?.contradictions?.length) {
    actions.push(`${actions.length + 1}. CONTRADICTION REVIEW: ${note.contradictions[0]}`);
  }

  if (note?.evidencePoints?.length) {
    actions.push(`${actions.length + 1}. EVIDENCE TRACE: ${note.evidencePoints[0]}`);
  }

  if (context.notes.trim().length === 0) {
    actions.push(`${actions.length + 1}. REQUEST CONTEXT: Ask supervisor for location, equipment state, and PPE context.`);
  }

  if ((note?.ambiguityScore ?? 0) > 0.45) {
    actions.push(`${actions.length + 1}. REDUCE AMBIGUITY: Ask for a closer angle or more specific hazard location.`);
  }

  return Array.from(new Set(actions)).slice(0, 8);
}

function buildPositives(result: AuditResult, context: EnrichmentContext): string[] {
  const positives = [...result.positives];
  const note = result.noteAnalysis;

  positives.push("Enrichment was generated locally without external model dependence.");

  if (note && note.detailScore >= 0.6) {
    positives.push("Supervisor notes provided high-signal detail that improved local audit enrichment.");
  }

  if (note && note.intentConfidence >= 0.7) {
    positives.push(`Local NLP confidently understood note intent as ${note.intent.replace(/_/g, " ")}.`);
  }

  if (note && note.evidencePoints && note.evidencePoints.length > 0) {
    positives.push(`Evidence tracing extracted ${note.evidencePoints.length} grounded detail signals from the supervisor note.`);
  }

  positives.push(`Inspection mode context (${context.inspectionMode}) was included in local decision weighting.`);

  return Array.from(new Set(positives)).slice(0, 6);
}

function recalculateScore(hazards: Hazard[], baseScore: number): number {
  const penalty = hazards.reduce((sum, hazard) => sum + severityWeight(hazard.severity), 0);
  const normalizedPenalty = Math.round(penalty * 0.22);
  return Math.max(0, Math.min(100, Math.round((baseScore * 0.72) + ((100 - normalizedPenalty) * 0.28))));
}

export function enrichAuditLocally(result: AuditResult, context: EnrichmentContext): AuditResult {
  const note = result.noteAnalysis;
  const additionalHazards = HAZARD_RULES
    .filter((rule) => rule.match(note, context, result))
    .map((rule) => rule.hazard);

  const hazards = sortHazards(uniqueByItem([...result.hazards, ...additionalHazards])).slice(0, 10);
  const safetyScore = recalculateScore(hazards, result.safetyScore);
  const confidence = clamp01(
    (result.confidence * 0.78) +
      (note?.noteWeight ?? 0.2) * 0.12 +
      (note?.intentConfidence ?? 0.2) * 0.1 -
      (note?.ambiguityScore ?? 0) * 0.05
  );

  const executiveSummaryParts = [result.executiveSummary];
  if (note) {
    executiveSummaryParts.push(`Local note intelligence: ${note.summary}`);
    if (note.reasoningTrail?.length) {
      executiveSummaryParts.push(`Reasoning trace: ${note.reasoningTrail.slice(0, 2).join(" ")}`);
    }
  }
  executiveSummaryParts.push("Final enrichment was performed entirely by local analysis components.");

  return {
    ...result,
    hazards,
    safetyScore,
    confidence,
    actionPlan: buildLocalActions(result, context),
    positives: buildPositives(result, context),
    executiveSummary: executiveSummaryParts.join(" "),
  };
}
