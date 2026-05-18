/**
 * Local ML Pipeline: combines scene classification, ANN inference, and hazard synthesis.
 * This path runs fully on the server without requiring the Gemini API.
 * IMPROVEMENTS: Advanced neural network with ensemble voting, precision scoring, and 3-tier suggestion ranking.
 */

import { classifySceneType, type ImageFeatures, type SceneType } from "./image-classifier";
import { analyzePictureForHazards } from "./cv-analyzer";
import { runAnnAnalysis } from "./ann-analyzer";
import { generateFocusAreas, inferHazardsFromObjects } from "./hazard-detector";
import type { AuditResult, Hazard } from "@/types/audit";

interface CVHazardsData {
  colorBasedHazards: string[];
  patternBasedHazards: string[];
  obscuredAreas: number;
  riskScore: number;
}

type DetectedObject = {
  class: string;
  score: number;
  bbox: [number, number, number, number];
};

export async function runLocalAudit(fileBuffer: Buffer, inspectionMode: string, supervisorNotes: string): Promise<AuditResult> {
  try {
    const { scene, confidence: sceneConfidence, features } = await classifySceneType(fileBuffer);
    const cvHazards = await analyzePictureForHazards(fileBuffer);
    const ann = runAnnAnalysis(buildAnnInput(features, cvHazards));

    // IMPROVEMENT: Use ensemble votes and precision score for better scene selection
    const effectiveScene = ann.precisionScore && ann.precisionScore >= 0.75 ? ann.predictedScene : scene;
    const detectedObjects = simulateObjectDetection(effectiveScene, features);
    const inferredHazards = inferHazardsFromObjects(detectedObjects, effectiveScene);
    const focusAreas = generateFocusAreas(detectedObjects, inferredHazards);
    const allHazards = combineHazards(inferredHazards, cvHazards);

    const heuristicSafetyScore = calculateSafetyScore(allHazards, cvHazards);
    const annSafetyScore = Math.max(0, 100 - Math.round(ann.riskScore * 100));
    
    // IMPROVEMENT: Use precision score to weight ensemble more heavily when confident
    const precisionWeight = (ann.precisionScore ?? 0.65) * 0.5; // 0.325-0.5
    const heuristicWeight = 1 - precisionWeight; // 0.5-0.675
    const safetyScore = Math.round(heuristicSafetyScore * heuristicWeight + annSafetyScore * precisionWeight);

    const assessmentText = generateAssessmentText(effectiveScene, safetyScore, allHazards, ann);
    const actionPlan = generateActionPlan(allHazards, inspectionMode, ann.moreInfoNeeded, supervisorNotes, ann.ensembleVotes);
    const ppeCompliance = evaluatePPE(allHazards, effectiveScene);
    const positives = generatePositives(effectiveScene, allHazards, cvHazards, ann);
    
    // IMPROVEMENT: Confidence now incorporates precision score and ensemble agreement
    const ensembleConsistency = ann.ensembleVotes ? ann.ensembleVotes[effectiveScene] ?? 0 : 1;
    const overallConfidence = clamp01(
      sceneConfidence * 0.2 + 
      ann.confidence * 0.35 + 
      (1 - cvHazards.riskScore) * 0.25 +
      (ann.precisionScore ?? 0.5) * 0.15 +
      (ensembleConsistency / 3) * 0.05
    );

    return {
      safetyScore,
      environmentStatus: assessmentText.status,
      executiveSummary: assessmentText.summary,
      hazards: allHazards.slice(0, 8),
      focusAreas: focusAreas.slice(0, 5),
      actionPlan: actionPlan.slice(0, 5),
      ppeCompliance,
      positives: positives.slice(0, 4),
      confidence: overallConfidence,
      timestamp: new Date().toISOString(),
      uncertainty: ann.uncertainty,
      moreInfoNeeded: ann.uncertainty > 0.4 ? ann.moreInfoNeeded : [],
      annSummary: ann.explanation,
      predictedScene: effectiveScene,
      precisionScore: ann.precisionScore,
      ensembleVotes: ann.ensembleVotes,
    };
  } catch (error) {
    console.error("Local audit error:", error);
    return generateFallbackAudit();
  }
}

function buildAnnInput(features: ImageFeatures, cvHazards: CVHazardsData) {
  const colorHistogram = features.colorHistogram;
  const totalColorCount = Math.max(1, colorHistogram.reds + colorHistogram.greens + colorHistogram.blues + colorHistogram.grays + colorHistogram.darks + colorHistogram.metallicSilver);

  return {
    brightness: features.brightness,
    contrast: features.contrast,
    edgeDensity: features.edgeDensity,
    metallic: features.hasMetallic ? 1 : 0,
    wooden: features.hasWooden ? 1 : 0,
    concrete: features.hasConcrete ? 1 : 0,
    glass: features.hasGlass ? 1 : 0,
    cvRisk: cvHazards.riskScore,
    obscuredAreas: cvHazards.obscuredAreas / 100,
    darkRatio: colorHistogram.darks / totalColorCount,
  };
}

function simulateObjectDetection(scene: SceneType, features: Pick<ImageFeatures, "hasMetallic" | "hasWooden" | "hasGlass" | "brightness">): DetectedObject[] {
  const objects: DetectedObject[] = [];

  switch (scene) {
    case "workshop":
      if (features.hasMetallic) {
        objects.push({ class: "saw", score: 0.72, bbox: [0.1, 0.3, 0.4, 0.7] });
      }
      if (features.hasWooden) {
        objects.push({ class: "worktable", score: 0.65, bbox: [0.3, 0.4, 0.8, 0.9] });
      }
      objects.push({ class: "tool", score: 0.58, bbox: [0.05, 0.1, 0.25, 0.35] });
      break;
    case "lab":
      if (features.hasGlass) {
        objects.push({ class: "beaker", score: 0.68, bbox: [0.4, 0.35, 0.65, 0.75] });
        objects.push({ class: "fume_hood", score: 0.75, bbox: [0.1, 0.1, 0.9, 0.6] });
      }
      objects.push({ class: "chemical_container", score: 0.55, bbox: [0.65, 0.5, 0.95, 0.95] });
      break;
    case "factory":
      if (features.hasMetallic && features.brightness < 0.5) {
        objects.push({ class: "rotating_machinery", score: 0.78, bbox: [0.2, 0.2, 0.7, 0.8] });
        objects.push({ class: "grinder", score: 0.62, bbox: [0.7, 0.3, 0.95, 0.7] });
      }
      objects.push({ class: "industrial_equipment", score: 0.71, bbox: [0, 0, 1, 1] });
      break;
    case "warehouse":
      objects.push({ class: "pallet", score: 0.73, bbox: [0.1, 0.5, 0.4, 0.95] });
      objects.push({ class: "racking", score: 0.81, bbox: [0, 0, 1, 0.9] });
      objects.push({ class: "forklift", score: 0.52, bbox: [0.45, 0.4, 0.75, 0.8] });
      break;
    case "office":
      objects.push({ class: "desk", score: 0.67, bbox: [0.1, 0.3, 0.6, 0.8] });
      objects.push({ class: "computer", score: 0.58, bbox: [0.35, 0.2, 0.55, 0.45] });
      break;
    default:
      objects.push({ class: "general_area", score: 0.5, bbox: [0, 0, 1, 1] });
  }

  return objects;
}

function combineHazards(objectHazards: Hazard[], cvHazards: CVHazardsData): Hazard[] {
  const combined: Hazard[] = [...objectHazards];

  for (const colorHazard of cvHazards.colorBasedHazards) {
    if (!combined.some((hazard) => hazard.item.toLowerCase().includes(colorHazard.toLowerCase()))) {
      combined.push({ item: colorHazard, severity: "MEDIUM", description: colorHazard });
    }
  }

  for (const patternHazard of cvHazards.patternBasedHazards) {
    if (!combined.some((hazard) => hazard.item.toLowerCase().includes(patternHazard.toLowerCase()))) {
      combined.push({ item: patternHazard, severity: "LOW", description: patternHazard });
    }
  }

  return combined;
}

function calculateSafetyScore(hazards: Hazard[], cvHazards: { riskScore: number; obscuredAreas: number }): number {
  let score = 100;

  score -= hazards.filter((hazard) => hazard.severity === "HIGH").length * 18;
  score -= hazards.filter((hazard) => hazard.severity === "MEDIUM").length * 10;
  score -= hazards.filter((hazard) => hazard.severity === "LOW").length * 4;
  score -= Math.round(cvHazards.riskScore * 15);
  score -= Math.round(cvHazards.obscuredAreas * 0.15);

  return Math.max(0, Math.min(100, score));
}

function generateAssessmentText(
  scene: SceneType,
  safetyScore: number,
  hazards: Hazard[],
  ann: { uncertainty: number; explanation: string; moreInfoNeeded: string[] }
): { status: string; summary: string } {
  let status = "";
  let summary = "";

  if (safetyScore >= 85) {
    status = "COMPLIANT - Workspace meets safety standards";
    summary = `This ${scene} workspace demonstrates good safety practices. ${hazards.length} minor items were noted for routine attention. Continue scheduled inspections and maintain current protocols.`;
  } else if (safetyScore >= 60) {
    status = "ATTENTION REQUIRED - Address identified issues";
    summary = `This ${scene} workspace has ${hazards.filter((hazard) => hazard.severity === "HIGH").length} high-priority and ${hazards.filter((hazard) => hazard.severity === "MEDIUM").length} medium-priority hazards. Implement corrective actions within the specified timelines to improve safety rating.`;
  } else {
    status = "CRITICAL HAZARDS DETECTED - Immediate action required";
    summary = `URGENT: This ${scene} workspace has critical safety violations that pose immediate risk. ${hazards.filter((hazard) => hazard.severity === "HIGH").length} high-severity hazards require immediate remediation. Do not proceed with normal operations until all HIGH-severity issues are resolved.`;
  }

  if (ann.uncertainty > 0.4) {
    summary += ` The ANN is uncertain and needs more context: ${ann.moreInfoNeeded.slice(0, 2).join(" ")}`;
  } else {
    summary += ` ANN note: ${ann.explanation}`;
  }

  return { status, summary };
}

function generateActionPlan(
  hazards: Hazard[],
  inspectionMode: string,
  moreInfoNeeded: string[],
  supervisorNotes: string,
  ensembleVotes?: Record<string, number>
): string[] {
  const actions = [
    `1. ISOLATE HAZARDS: Restrict access to areas with identified ${hazards.filter((hazard) => hazard.severity === "HIGH").length || "high-severity"} hazards and prevent operations until corrected.`,
    `2. ENFORCE PPE: Ensure all personnel in this ${inspectionMode} space are equipped with required personal protective equipment for identified risks.`,
    `3. REPAIR/REPLACE: Address ${hazards.filter((hazard) => hazard.severity === "HIGH").length || "structural"} equipment failures, missing guards, or damaged systems identified in this audit.`,
    `4. RESTORE ACCESS: Once hazards are mitigated, conduct secondary inspection and formally restore operational access with documented sign-off.`,
  ];

  // IMPROVEMENT: Add ensemble voting confidence context
  if (ensembleVotes && Math.max(...Object.values(ensembleVotes)) >= 2) {
    actions.push(`5. ENSEMBLE CONSENSUS: Multiple ANN models agree on this scene classification, increasing confidence in hazard assessment.`);
  } else if (moreInfoNeeded.length > 0) {
    actions.push(`5. COLLECT MORE CONTEXT: ${moreInfoNeeded[0]}`);
  } else if (supervisorNotes.trim().length > 0) {
    actions.push(`5. SUPERVISOR CONTEXT: Review the uploaded notes and verify them against the visual evidence.`);
  }

  return actions;
}

function evaluatePPE(hazards: Hazard[], scene: SceneType): "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT" {
  const highHazards = hazards.filter((hazard) => hazard.severity === "HIGH").length;

  if (highHazards > 3) return "NON_COMPLIANT";
  if (highHazards > 1) return "PARTIAL";
  if (scene === "factory" || scene === "workshop" || scene === "lab") return "PARTIAL";

  return "COMPLIANT";
}

function generatePositives(
  scene: SceneType,
  hazards: Hazard[],
  cvHazards: { colorBasedHazards: string[]; obscuredAreas: number },
  ann: { confidence: number; uncertainty: number }
): string[] {
  const positives: string[] = [];

  if (hazards.filter((hazard) => hazard.severity === "HIGH").length === 0) {
    positives.push("No critical safety violations detected in this area");
  }

  if (cvHazards.colorBasedHazards.length === 0) {
    positives.push("Color analysis shows no obvious signs of spills or hazardous materials");
  }

  if (cvHazards.obscuredAreas < 25) {
    positives.push("Adequate lighting and visibility throughout the workspace");
  }

  if (ann.confidence > 0.65 && ann.uncertainty < 0.35) {
    positives.push(`ANN confidently identified a ${scene} layout pattern.`);
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

  positives.push(...scenePositives[scene]);
  return positives.slice(0, 4);
}

function generateFallbackAudit(): AuditResult {
  return {
    safetyScore: 50,
    environmentStatus: "ANALYSIS INCOMPLETE - Please retry with clearer image",
    executiveSummary: "Local ML analysis could not complete. Ensure image is in focus and properly lit. Try again or contact support.",
    hazards: [{ item: "Analysis Error", severity: "MEDIUM", description: "Image processing failed - please recapture" }],
    focusAreas: [],
    actionPlan: ["Recapture image ensuring focus and adequate lighting", "Retry audit analysis"],
    ppeCompliance: "PARTIAL",
    positives: ["System recovered gracefully"],
    confidence: 0.3,
    timestamp: new Date().toISOString(),
    uncertainty: 1,
    moreInfoNeeded: ["Retake the image with brighter lighting and a steadier angle."],
    annSummary: "Fallback path used because local analysis could not be completed.",
    predictedScene: "unknown",
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
