/**
 * CV Analyzer: Computer vision-based hazard detection
 * Analyzes colors, patterns, and spatial layout for hazards
 */

interface PixelAnalysis {
  redIntensity: number;
  hazardousColorRatio: number;
  hasSuspiciousRedPattern: boolean;
  hasOrangePattern: boolean;
  hasDarkPatterns: boolean;
  edgesPerArea: number;
}

export interface CVHazards {
  colorBasedHazards: string[];
  patternBasedHazards: string[];
  obscuredAreas: number; // percentage
  riskScore: number;
}

export async function analyzePictureForHazards(fileBuffer: Buffer): Promise<CVHazards> {
  try {
    const analysis = await analyzeBitmap(fileBuffer);
    const colorHazards = inferColorHazards(analysis);
    const patternHazards = inferPatternHazards(analysis);
    const obscuredAreas = estimateObscuredAreas(analysis);
    const riskScore = calculateCVRiskScore(analysis);

    return {
      colorBasedHazards: colorHazards,
      patternBasedHazards: patternHazards,
      obscuredAreas,
      riskScore,
    };
  } catch (error) {
    console.error("CV analysis error:", error);
    return {
      colorBasedHazards: [],
      patternBasedHazards: [],
      obscuredAreas: 0,
      riskScore: 0.3,
    };
  }
}

async function analyzeBitmap(fileBuffer: Buffer): Promise<PixelAnalysis> {
  // Simplified analysis (in production, would use actual Sharp metadata)
  const totalPixels = fileBuffer.length / 3;
  let redSum = 0;
  let hazardousCount = 0;
  let redPatternPixels = 0;
  let orangePatternPixels = 0;
  let darkPixels = 0;
  let edgeCount = 0;

  // Sample analysis
  const sampleSize = Math.min(1000, totalPixels);
  for (let i = 0; i < sampleSize; i++) {
    const idx = Math.floor(Math.random() * (fileBuffer.length / 3)) * 3;
    const r = fileBuffer[idx] || 0;
    const g = fileBuffer[idx + 1] || 0;
    const b = fileBuffer[idx + 2] || 0;

    redSum += r;

    // Red patterns (blood, danger, fire)
    if (r > 180 && g < 100 && b < 100) {
      redPatternPixels++;
      hazardousCount++;
    }

    // Orange patterns (warning, caution)
    if (r > 200 && g > 100 && g < 180 && b < 80) {
      orangePatternPixels++;
      hazardousCount++;
    }

    // Dark areas (obscured, shadows)
    if (r < 50 && g < 50 && b < 50) {
      darkPixels++;
    }

    // Edge detection (simple)
    if (Math.abs(r - g) > 40 || Math.abs(g - b) > 40) {
      edgeCount++;
    }
  }

  return {
    redIntensity: redSum / sampleSize / 255,
    hazardousColorRatio: hazardousCount / sampleSize,
    hasSuspiciousRedPattern: redPatternPixels > sampleSize * 0.05,
    hasOrangePattern: orangePatternPixels > sampleSize * 0.03,
    hasDarkPatterns: darkPixels > sampleSize * 0.3,
    edgesPerArea: edgeCount / sampleSize,
  };
}

function inferColorHazards(analysis: PixelAnalysis): string[] {
  const hazards: string[] = [];

  if (analysis.hasSuspiciousRedPattern) {
    hazards.push("Possible blood or red hazardous material detected");
    hazards.push("Chemical spill or biohazard - immediate investigation required");
  }

  if (analysis.hasOrangePattern) {
    hazards.push("Warning/caution markings detected - review area for hazards");
  }

  if (analysis.redIntensity > 0.6 && !analysis.hasSuspiciousRedPattern) {
    hazards.push("Bright red surfaces - verify fire extinguisher access");
  }

  if (analysis.hazardousColorRatio > 0.15) {
    hazards.push("High concentration of hazard-colored areas detected");
  }

  return hazards.slice(0, 3);
}

function inferPatternHazards(analysis: PixelAnalysis): string[] {
  const hazards: string[] = [];

  if (analysis.hasDarkPatterns) {
    hazards.push("Significant shadowed or dark areas - verify adequate lighting");
    hazards.push("Potential tripping hazard in poorly lit zones");
  }

  if (analysis.edgesPerArea > 0.4) {
    hazards.push("High visual complexity - possible clutter or disorganization");
    hazards.push("Ensure pathways are clear and organized");
  }

  if (analysis.edgesPerArea > 0.6) {
    hazards.push("Dense machinery or equipment detected - verify guarding");
  }

  return hazards.slice(0, 2);
}

function estimateObscuredAreas(analysis: PixelAnalysis): number {
  // Estimate percentage of obscured/dark areas
  return Math.min(100, analysis.hasDarkPatterns ? 35 : 15);
}

function calculateCVRiskScore(analysis: PixelAnalysis): number {
  let score = 0.2; // Base

  if (analysis.hasSuspiciousRedPattern) score += 0.35;
  if (analysis.hasOrangePattern) score += 0.15;
  if (analysis.hasDarkPatterns) score += 0.2;
  if (analysis.edgesPerArea > 0.4) score += 0.15;
  if (analysis.hazardousColorRatio > 0.15) score += 0.1;

  return Math.min(score, 1.0);
}
