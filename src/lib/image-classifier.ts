/**
 * Image Classifier: Determines workspace type (workshop, lab, factory, warehouse, office)
 * Uses color analysis, edge detection, and pixel patterns
 */

import sharp from "sharp";

export type SceneType = "workshop" | "lab" | "factory" | "warehouse" | "office" | "outdoor" | "unknown";

interface ColorHistogram {
  reds: number;
  greens: number;
  blues: number;
  grays: number;
  darks: number;
  metallicSilver: number;
}

interface ImageFeatures {
  dominantColor: string;
  colorHistogram: ColorHistogram;
  brightness: number;
  contrast: number;
  edgeDensity: number;
  hasMetallic: boolean;
  hasWooden: boolean;
  hasConcrete: boolean;
  hasGlass: boolean;
  detectedMaterials: { wooden: boolean; concrete: boolean; glass: boolean };
}


export async function classifySceneType(fileBuffer: Buffer): Promise<{ scene: SceneType; confidence: number; features: ImageFeatures }> {
  try {
    // Resize for analysis (faster processing)
    const resized = await sharp(fileBuffer).resize(256, 256).toBuffer();

    // Get pixel data
    const { data, width, height } = await sharp(resized).raw().toBuffer().then((buffer) => ({
      buffer,
      width: 256,
      height: 256,
      data: new Uint8ClampedArray(buffer),
    }));

    const features = analyzePixels(data, width, height);
    const scene = classifyByFeatures(features);
    const confidence = calculateConfidence(features, scene);

    return { scene, confidence, features };
  } catch (error) {
    console.error("Scene classification error:", error);
    return {
      scene: "unknown",
      confidence: 0.3,
      features: getDefaultFeatures(),
    };
  }
}

function analyzePixels(data: Uint8ClampedArray, width: number, height: number): ImageFeatures {
  const samples = 1000; // Sample pixels for speed
  const sampleIndices: number[] = [];

  // Random sampling
  for (let i = 0; i < samples && i < data.length / 3; i++) {
    sampleIndices.push(Math.floor(Math.random() * (data.length / 3)) * 3);
  }

  const histogram: ColorHistogram = {
    reds: 0,
    greens: 0,
    blues: 0,
    grays: 0,
    darks: 0,
    metallicSilver: 0,
  };

  let totalBrightness = 0;
  let maxBrightness = 0;
  let minBrightness = 255;

  let hasWooden = false;
  let hasConcrete = false;
  let hasGlass = false;

  for (const idx of sampleIndices) {
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    const brightness = (r + g + b) / 3;
    totalBrightness += brightness;
    maxBrightness = Math.max(maxBrightness, brightness);
    minBrightness = Math.min(minBrightness, brightness);

    // Color classification
    if (Math.abs(r - g) < 10 && Math.abs(g - b) < 10) {
      histogram.grays++;
      if (brightness < 100) histogram.darks++;
    } else if (r > g + 20 && r > b + 20) {
      histogram.reds++;
    } else if (g > r + 20 && g > b + 20) {
      histogram.greens++;
    } else if (b > r + 20 && b > g + 20) {
      histogram.blues++;
      hasGlass = true;
    }

    // Metallic/silver detection (high brightness, low saturation)
    if (brightness > 180 && Math.max(Math.abs(r - g), Math.abs(g - b)) < 30) {
      histogram.metallicSilver++;
    }

    // Material detection
    if (r > 140 && g > 110 && b < 100) {
      hasWooden = true; // Brown tones
    }
    if (brightness > 150 && Math.max(r, g, b) - Math.min(r, g, b) < 40) {
      hasConcrete = true; // Gray tones
    }
  }

  const avgBrightness = totalBrightness / sampleIndices.length;
  const contrast = maxBrightness - minBrightness;

  return {
    dominantColor: getDominantColor(histogram),
    colorHistogram: histogram,
    brightness: avgBrightness / 255,
    contrast: contrast / 255,
    edgeDensity: estimateEdgeDensity(data, width, height),
    hasMetallic: histogram.metallicSilver > sampleIndices.length * 0.1,
    hasWooden: hasWooden || histogram.reds > sampleIndices.length * 0.15,
    hasConcrete: hasConcrete || histogram.grays > sampleIndices.length * 0.2,
    hasGlass: hasGlass || histogram.blues > sampleIndices.length * 0.15,
    detectedMaterials: { wooden: hasWooden, concrete: hasConcrete, glass: hasGlass },
  };
}

function getDominantColor(histogram: ColorHistogram): string {
  const colors = [
    { name: "red", count: histogram.reds },
    { name: "green", count: histogram.greens },
    { name: "blue", count: histogram.blues },
    { name: "gray", count: histogram.grays },
  ];

  return colors.reduce((a, b) => (a.count > b.count ? a : b)).name;
}

function estimateEdgeDensity(data: Uint8ClampedArray, width: number, height: number): number {
  // Sobel edge detection on random rows/cols
  let edgePixels = 0;
  const samples = Math.min(50, height);

  for (let i = 0; i < samples; i++) {
    const row = Math.floor(Math.random() * (height - 2)) + 1;
    for (let col = 1; col < width - 1; col++) {
      const idx = (row * width + col) * 3;
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

      const topBright = (data[((row - 1) * width + col) * 3] + data[((row - 1) * width + col) * 3 + 1] + data[((row - 1) * width + col) * 3 + 2]) / 3;
      const bottomBright = (data[((row + 1) * width + col) * 3] + data[((row + 1) * width + col) * 3 + 1] + data[((row + 1) * width + col) * 3 + 2]) / 3;

      if (Math.abs(brightness - topBright) > 30 || Math.abs(brightness - bottomBright) > 30) {
        edgePixels++;
      }
    }
  }

  return edgePixels / (samples * width);
}

function classifyByFeatures(features: ImageFeatures): SceneType {
  const { brightness, hasMetallic, hasWooden, hasConcrete, hasGlass, colorHistogram } = features;

  // Factory: dark, metallic, industrial
  if (brightness < 0.4 && hasMetallic) {
    return "factory";
  }

  // Workshop: brown, wooden, metallic mix
  if (hasWooden && hasMetallic) {
    return "workshop";
  }

  // Lab: bright, clean, glass, organized
  if (brightness > 0.65 && hasGlass) {
    return "lab";
  }

  // Warehouse: very large gray concrete areas
  if (hasConcrete && brightness > 0.45) {
    return "warehouse";
  }

  // Office: bright, glass, not industrial
  if (brightness > 0.7 && hasGlass && !hasMetallic) {
    return "office";
  }

  // Outdoor: high contrast, varied colors
  if (features.contrast > 0.5) {
    return "outdoor";
  }

  return "unknown";
}

function calculateConfidence(features: ImageFeatures, scene: SceneType): number {
  let score = 0.5; // Base confidence

  if (features.brightness > 0.3 && features.brightness < 0.9) score += 0.1; // Normal range
  if (features.contrast > 0.2) score += 0.1; // Good contrast
  if (features.edgeDensity > 0.05) score += 0.15; // Has features/objects
  if (features.hasMetallic) score += 0.1; // Industrial indicator
  if (features.hasConcrete) score += 0.05; // Structure indicator

  return Math.min(score, 1.0);
}

function getDefaultFeatures(): ImageFeatures {
  return {
    dominantColor: "gray",
    colorHistogram: {
      reds: 0,
      greens: 0,
      blues: 0,
      grays: 100,
      darks: 0,
      metallicSilver: 0,
    },
    brightness: 0.5,
    contrast: 0.3,
    edgeDensity: 0.1,
    hasMetallic: false,
    hasWooden: false,
    hasConcrete: false,
    hasGlass: false,
    detectedMaterials: { wooden: false, concrete: false, glass: false },
  };
}
