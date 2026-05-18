import type { AuditResult, Severity } from "@/types/audit";

const HAZARD_POOL: { item: string; severity: Severity; description: string }[] = [
  {
    item: "Unsecured power cable across walkway",
    severity: "HIGH",
    description: "Trip risk near energized equipment can cause falls or sudden contact with machinery.",
  },
  {
    item: "No safety goggles observed",
    severity: "HIGH",
    description: "Eye injury risk from airborne debris and accidental splashes in active work zones.",
  },
  {
    item: "Improper tool storage",
    severity: "MEDIUM",
    description: "Loose tools near edges may drop and create impact hazards.",
  },
  {
    item: "Blocked emergency stop access",
    severity: "HIGH",
    description: "Delayed emergency shutdown can escalate incidents significantly.",
  },
  {
    item: "Missing glove usage near sharp material",
    severity: "MEDIUM",
    description: "Increases laceration and puncture injury potential.",
  },
  {
    item: "Unlabeled chemical container",
    severity: "MEDIUM",
    description: "Unknown substances can lead to unsafe handling and exposure.",
  },
  {
    item: "Minor clutter around workstation",
    severity: "LOW",
    description: "Housekeeping gaps can compound into broader safety issues over time.",
  },
  {
    item: "Insufficient ventilation indication",
    severity: "MEDIUM",
    description: "Poor airflow may elevate inhalation risk when volatile materials are present.",
  },
];

function seededFromText(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededUnit(seed: number, offset: number): number {
  const value = Math.sin(seed + offset * 9973) * 10000;
  return value - Math.floor(value);
}

export function buildMockAudit(seedText: string): AuditResult {
  const seed = seededFromText(seedText || "workspace");
  const hazardCount = (seed % 4) + 2;
  const chosen = Array.from({ length: hazardCount }, (_, i) => HAZARD_POOL[(seed + i * 3) % HAZARD_POOL.length]);
  const focusAreas = chosen.slice(0, 4).map((hazard, index) => {
    const left = 8 + Math.round(seededUnit(seed, index * 4) * 58);
    const top = 8 + Math.round(seededUnit(seed, index * 4 + 1) * 48);
    const width = 18 + Math.round(seededUnit(seed, index * 4 + 2) * 16);
    const height = 14 + Math.round(seededUnit(seed, index * 4 + 3) * 14);

    return {
      label: hazard.item,
      severity: hazard.severity,
      x: Math.min(left, 92),
      y: Math.min(top, 88),
      width: Math.min(width, 28),
      height: Math.min(height, 24),
      note: hazard.description,
    };
  });

  const penalty = chosen.reduce((score, hazard) => {
    if (hazard.severity === "HIGH") return score + 18;
    if (hazard.severity === "MEDIUM") return score + 10;
    return score + 4;
  }, 0);

  const safetyScore = Math.max(20, 100 - penalty);
  const environmentStatus =
    safetyScore >= 85
      ? "COMPLIANT WITH MINOR OBSERVATIONS"
      : safetyScore >= 60
        ? "ATTENTION REQUIRED"
        : "CRITICAL HAZARDS DETECTED";

  return {
    safetyScore,
    environmentStatus,
    executiveSummary:
      safetyScore >= 85
        ? "Workspace is largely compliant with only minor housekeeping observations."
        : safetyScore >= 60
          ? "Multiple corrective actions are required before the area should be treated as safe for continued work."
          : "Critical hazards are present; the workspace should be paused until immediate mitigation is complete.",
    hazards: chosen,
    focusAreas,
    actionPlan: [
      "Isolate and remove immediate trip and electrical hazards.",
      "Enforce PPE checks before task restart.",
      "Restore clear emergency-stop and exit access paths.",
      "Perform end-of-shift housekeeping and verification sign-off.",
    ],
    ppeCompliance: safetyScore > 70 ? "PARTIAL" : "NON-COMPLIANT",
    positives: [
      "General workstation zoning appears defined.",
      "Primary equipment appears physically stable.",
    ],
    confidence: 0.86,
    timestamp: new Date().toISOString(),
  };
}
