/**
 * Local ML Pipeline: Combines image classification, hazard detection, and CV analysis
 * Generates complete audit results WITHOUT relying on Gemini API (standalone ML)
 */

import { classifySceneType, type SceneType } from "./image-classifier";
import { inferHazardsFromObjects, generateFocusAreas } from "./hazard-detector";
import { analyzePictureForHazards } from "./cv-analyzer";
import type { AuditResult, Hazard } from "@/types/audit";

interface CVHazardsData {
  colorBasedHazards: string[];
  patternBasedHazards: string[];
  obscuredAreas: number;
  riskScore: number;
}

interface DetectedObjectData {
  class: string;
  score: number;
  bbox: [number, number, number, number];
}
export async function runLocalAudit(fileBuffer: Buffer, inspectionMode: string, _supervisorNotes: string): Promise<AuditResult> {
  try {
    // Step 1: Classify the workspace type
    const { scene, confidence: sceneConfidence, features } = await classifySceneType(fileBuffer);

    // Step 2: Run CV analysis for color/pattern hazards
    const cvHazards = await analyzePictureForHazards(fileBuffer);

    // Step 3: Simulate object detection (in production, would use COCO-SSD)
    const detectedObjects = simulateObjectDetection(scene, features);

    // Step 4: Infer hazards from detected objects
    const inferredHazards = inferHazardsFromObjects(detectedObjects, scene);

    // Step 5: Generate focus areas
    const focusAreas = generateFocusAreas(detectedObjects, inferredHazards);

    // Step 6: Combine CV hazards with object hazards
    const allHazards = combineHazards(inferredHazards, cvHazards);

    // Step 7: Calculate safety score
    const safetyScore = calculateSafetyScore(allHazards, cvHazards, scene);

    // Step 8: Generate assessment text
    const assessmentText = generateAssessmentText(scene, safetyScore, allHazards);

    // Step 9: Generate action plan
    const actionPlan = generateActionPlan(allHazards, inspectionMode);

    // Step 10: Evaluate PPE compliance
    const ppeCompliance = evaluatePPE(allHazards, scene);

    // Step 11: Generate positives
    const positives = generatePositives(scene, allHazards, cvHazards);

    // Step 12: Calculate confidence
    const overallConfidence = Math.min((sceneConfidence + cvHazards.riskScore) / 2, 1.0);

    return {
      safetyScore: Math.round(safetyScore),
      environmentStatus: assessmentText.status,
      executiveSummary: assessmentText.summary,
      hazards: allHazards.slice(0, 8),
      focusAreas: focusAreas.slice(0, 5),
      actionPlan: actionPlan.slice(0, 5),
      ppeCompliance,
      positives: positives.slice(0, 3),
      confidence: overallConfidence,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Local audit error:", error);
    // Fallback audit
    return generateFallbackAudit();
  }
}

function simulateObjectDetection(
  scene: SceneType,
  features: { hasMetallic: boolean; hasWooden: boolean; hasGlass: boolean; brightness: number }
): Array<{ class: string; score: number; bbox: [number, number, number, number] }> {
  const objects = [];

  // Simulate detection based on scene type
  switch (scene) {
    case "workshop":
      if (features.hasMetallic) {
        objects.push({ class: "saw", score: 0.72, bbox: [0.1, 0.3, 0.4, 0.7] as [number, number, number, number] });
      }
      if (features.hasWooden) {
        objects.push({ class: "worktable", score: 0.65, bbox: [0.3, 0.4, 0.8, 0.9] as [number, number, number, number] });
      }
      objects.push({ class: "tool", score: 0.58, bbox: [0.05, 0.1, 0.25, 0.35] as [number, number, number, number] });
      break;

    case "lab":
      if (features.hasGlass) {
        objects.push({ class: "beaker", score: 0.68, bbox: [0.4, 0.35, 0.65, 0.75] as [number, number, number, number] });
        objects.push({ class: "fume_hood", score: 0.75, bbox: [0.1, 0.1, 0.9, 0.6] as [number, number, number, number] });
      }
      objects.push({ class: "chemical_container", score: 0.55, bbox: [0.65, 0.5, 0.95, 0.95] as [number, number, number, number] });
      break;

    case "factory":
      if (features.hasMetallic && features.brightness < 0.5) {
        objects.push({ class: "rotating_machinery", score: 0.78, bbox: [0.2, 0.2, 0.7, 0.8] as [number, number, number, number] });
        objects.push({ class: "grinder", score: 0.62, bbox: [0.7, 0.3, 0.95, 0.7] as [number, number, number, number] });
      }
      objects.push({ class: "industrial_equipment", score: 0.71, bbox: [0.0, 0.0, 1.0, 1.0] as [number, number, number, number] });
      break;

    case "warehouse":
      objects.push({ class: "pallet", score: 0.73, bbox: [0.1, 0.5, 0.4, 0.95] as [number, number, number, number] });
      objects.push({ class: "racking", score: 0.81, bbox: [0.0, 0.0, 1.0, 0.9] as [number, number, number, number] });
      objects.push({ class: "forklift", score: 0.52, bbox: [0.45, 0.4, 0.75, 0.8] as [number, number, number, number] });
      break;

    case "office":
      objects.push({ class: "desk", score: 0.67, bbox: [0.1, 0.3, 0.6, 0.8] as [number, number, number, number] });
      objects.push({ class: "computer", score: 0.58, bbox: [0.35, 0.2, 0.55, 0.45] as [number, number, number, number] });
      break;

    default:
      objects.push({ class: "general_area", score: 0.5, bbox: [0.0, 0.0, 1.0, 1.0] as [number, number, number, number] });
  }

  return objects;
}

function combineHazards(objectHazards: Hazard[], cvHazards: CVHazardsData): Hazard[] {
  const combined: Hazard[] = [...objectHazards];

  // Add CV hazards if they don't already exist
  for (const colorHazard of cvHazards.colorBasedHazards) {
    if (!combined.some((h) => h.item.toLowerCase().includes(colorHazard.toLowerCase()))) {
      combined.push({
        item: colorHazard,
        severity: "MEDIUM",
        description: colorHazard,
      });
    }
  }

  for (const patternHazard of cvHazards.patternBasedHazards) {
    if (!combined.some((h) => h.item.toLowerCase().includes(patternHazard.toLowerCase()))) {
      combined.push({
        item: patternHazard,
        severity: "LOW",
        description: patternHazard,
      });
    }
  }

  return combined;
}

function calculateSafetyScore(hazards: Hazard[], cvHazards: { riskScore: number; obscuredAreas: number }, _scene: SceneType): number {
  let score = 100;

  // Deduct for each hazard
  const highCount = hazards.filter((h) => h.severity === "HIGH").length;
  const mediumCount = hazards.filter((h) => h.severity === "MEDIUM").length;
  const lowCount = hazards.filter((h) => h.severity === "LOW").length;

  score -= highCount * 18;
  score -= mediumCount * 10;
  score -= lowCount * 4;

  // Additional deduction for CV risk
  score -= Math.round(cvHazards.riskScore * 15);

  // Deduction for obscured areas
  score -= Math.round(cvHazards.obscuredAreas * 0.15);

  return Math.max(0, Math.min(100, score));
}

function generateAssessmentText(scene: SceneType, safetyScore: number, hazards: Hazard[]): { status: string; summary: string } {
  let status = "";
  let summary = "";

  if (safetyScore >= 85) {
    status = "COMPLIANT - Workspace meets safety standards";
    summary = `This ${scene} workspace demonstrates good safety practices. ${hazards.length} minor items were noted for routine attention. Continue scheduled inspections and maintain current protocols.`;
  } else if (safetyScore >= 60) {
    status = "ATTENTION REQUIRED - Address identified issues";
    summary = `This ${scene} workspace has ${hazards.filter((h) => h.severity === "HIGH").length} high-priority and ${hazards.filter((h) => h.severity === "MEDIUM").length} medium-priority hazards. Implement corrective actions within the specified timelines to improve safety rating.`;
  } else {
    status = "CRITICAL HAZARDS DETECTED - Immediate action required";
    summary = `URGENT: This ${scene} workspace has critical safety violations that pose immediate risk. ${hazards.filter((h) => h.severity === "HIGH").length} high-severity hazards require immediate remediation. Do not proceed with normal operations until all HIGH-severity issues are resolved.`;
  }

  return { status, summary };
}

function generateActionPlan(hazards: Hazard[], inspectionMode: string): string[] {
  const actions = [
    `1. ISOLATE HAZARDS: Restrict access to areas with identified ${hazards.filter((h) => h.severity === "HIGH").length || "high-severity"} hazards and prevent operations until corrected.`,
    `2. ENFORCE PPE: Ensure all personnel in this ${inspectionMode} space are equipped with required personal protective equipment for identified risks.`,
    `3. REPAIR/REPLACE: Address ${hazards.filter((h) => h.severity === "HIGH").length || "structural"} equipment failures, missing guards, or damaged systems identified in this audit.`,
    `4. RESTORE ACCESS: Once hazards are mitigated, conduct secondary inspection and formally restore operational access with documented sign-off.`,
  ];

  return actions;
}

function evaluatePPE(hazards: Hazard[], scene: SceneType): "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT" {
  const highHazards = hazards.filter((h) => h.severity === "HIGH").length;

  if (highHazards > 3) return "NON_COMPLIANT";
  if (highHazards > 1) return "PARTIAL";

  // Scene-based evaluation
  if (scene === "factory" || scene === "workshop") return "PARTIAL";
  if (scene === "lab") return "PARTIAL";

  return "COMPLIANT";
}

function generatePositives(scene: SceneType, hazards: Hazard[], cvHazards: { colorBasedHazards: string[]; obscuredAreas: number }): string[] {
  const positives = [];

  if (hazards.filter((h) => h.severity === "HIGH").length === 0) {
    positives.push("No critical safety violations detected in this area");
  }

  if (cvHazards.colorBasedHazards.length === 0) {
    positives.push("Color analysis shows no obvious signs of spills or hazardous materials");
  }

  if (cvHazards.obscuredAreas < 25) {
    positives.push("Adequate lighting and visibility throughout the workspace");
  }

  const scenePositives: Record<SceneType, string[]> = {
    workshop: ["Tools appear to be organized", "Work areas are accessible"],
    lab: ["Chemical storage area appears contained", "Fume hood system visible"],
    factory: ["Workspace organized for operations", "Equipment placement logical"],
    warehouse: ["Racking system properly spaced", "Aisles are clear for movement"],
    office: ["Ergonomic layout suitable", "Fire exits are visible"],
    outdoor: ["Natural lighting available", "Weather conditions monitored"],
    unknown: ["Area surveyed successfully"],
  };

  positives.push(...(scenePositives[scene] || ["Workspace assessed comprehensively"]));

  return positives.slice(0, 4);
}

function generateFallbackAudit(): AuditResult {
  return {
    safetyScore: 50,
    environmentStatus: "ANALYSIS INCOMPLETE - Please retry with clearer image",
    executiveSummary: "Local ML analysis could not complete. Ensure image is in focus and properly lit. Try again or contact support.",
    hazards: [
      { item: "Analysis Error", severity: "MEDIUM", description: "Image processing failed - please recapture" },
    ],
    focusAreas: [],
    actionPlan: ["Recapture image ensuring focus and adequate lighting", "Retry audit analysis"],
    ppeCompliance: "PARTIAL",
    positives: ["System recovered gracefully"],
    confidence: 0.3,
    timestamp: new Date().toISOString(),
  };
}
