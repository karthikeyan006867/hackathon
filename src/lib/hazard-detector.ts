/**
 * Hazard Detector: Uses COCO-SSD for object detection + logic to infer safety hazards
 * Detects dangerous objects, spills, electrical hazards, slip hazards, etc.
 */

export interface DetectedObject {
  class: string;
  score: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2] normalized 0-1
}

export interface HazardInference {
  item: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  description: string;
  detectionConfidence: number;
}

export interface AnalysisResult {
  detectedObjects: DetectedObject[];
  inferredHazards: HazardInference[];
  focusAreas: Array<{ x: number; y: number; width: number; height: number; label: string; severity: "HIGH" | "MEDIUM" | "LOW" }>;
}

const HAZARD_RULES: Record<string, { severity: "HIGH" | "MEDIUM" | "LOW"; description: string }> = {
  // Electrical hazards
  power_outlet: { severity: "MEDIUM", description: "Exposed electrical outlet - ensure proper PPE and grounding" },
  electrical_wire: { severity: "HIGH", description: "Exposed electrical wiring - high electrocution risk" },
  cord: { severity: "MEDIUM", description: "Loose power cord - trip and fire hazard" },
  socket: { severity: "MEDIUM", description: "Electrical socket hazard - inspect insulation" },

  // Slip/trip hazards
  spill: { severity: "HIGH", description: "Liquid spill detected - immediate cleanup required" },
  floor_hazard: { severity: "MEDIUM", description: "Wet or uneven flooring - slip hazard" },
  water: { severity: "MEDIUM", description: "Standing water - electrical and slip hazards" },
  stair_hazard: { severity: "MEDIUM", description: "Stairs visible - ensure railings and proper lighting" },

  // Chemical/material hazards
  chemical_container: { severity: "HIGH", description: "Chemical container detected - verify labeling and containment" },
  toxic_substance: { severity: "HIGH", description: "Potentially toxic material - require ventilation and PPE" },
  acid_base: { severity: "HIGH", description: "Corrosive substance - high injury risk" },
  gasoline_can: { severity: "HIGH", description: "Fuel storage - fire and explosion risk" },

  // Equipment hazards
  rotating_machinery: { severity: "HIGH", description: "Rotating machinery - lockout/tagout required" },
  saw: { severity: "HIGH", description: "Power saw detected - ensure blade guards and training" },
  grinder: { severity: "HIGH", description: "Angle grinder - high speed; personal protection essential" },
  lathe: { severity: "HIGH", description: "Lathe operation - long hair/loose clothing prohibited" },
  press: { severity: "HIGH", description: "Industrial press - crushing hazard" },

  // General hazards
  clutter: { severity: "LOW", description: "Workspace clutter - organize and improve visibility" },
  poor_lighting: { severity: "MEDIUM", description: "Dark area detected - inadequate lighting" },
  missing_guard: { severity: "HIGH", description: "Machine guard missing - severe injury risk" },
  unsecured_load: { severity: "HIGH", description: "Unsecured materials stacked - falling object hazard" },
  no_ppe: { severity: "MEDIUM", description: "Personnel visible without PPE - non-compliance" },
  disorganized_tools: { severity: "LOW", description: "Tools not stored properly - trip and injury hazard" },
};

export function inferHazardsFromObjects(detectedObjects: DetectedObject[], sceneType: string): HazardInference[] {
  const hazards: HazardInference[] = [];
  const hazardSet = new Set<string>();

  for (const obj of detectedObjects) {
    // Normalize class name
    const normalized = obj.class.toLowerCase().replace(/[_\s-]/g, "_");

    // Direct hazard mapping
    if (HAZARD_RULES[normalized] && obj.score > 0.4) {
      const rule = HAZARD_RULES[normalized];
      const key = `${normalized}`;
      if (!hazardSet.has(key)) {
        hazards.push({
          item: normalizeItemName(normalized),
          severity: rule.severity,
          description: rule.description,
          detectionConfidence: obj.score,
        });
        hazardSet.add(key);
      }
    }

    // Scene-specific inferences
    if (sceneType === "workshop" && ["hammer", "wrench", "screwdriver", "saw"].includes(normalized)) {
      if (obj.score > 0.5 && !hazardSet.has("tool_usage")) {
        hazards.push({
          item: "Hand Tool Safety",
          severity: "LOW",
          description: "Ensure proper handling and storage of hand tools",
          detectionConfidence: obj.score,
        });
        hazardSet.add("tool_usage");
      }
    }

    if (sceneType === "lab" && ["beaker", "flask", "burner", "acid"].includes(normalized)) {
      if (obj.score > 0.5 && !hazardSet.has("chemical_handling")) {
        hazards.push({
          item: "Chemical Handling Protocol",
          severity: "HIGH",
          description: "Chemicals detected - verify proper ventilation and PPE",
          detectionConfidence: obj.score,
        });
        hazardSet.add("chemical_handling");
      }
    }

    if ((sceneType === "factory" || sceneType === "warehouse") && ["forklift", "pallet", "chain"].includes(normalized)) {
      if (obj.score > 0.5 && !hazardSet.has("heavy_equipment")) {
        hazards.push({
          item: "Heavy Equipment Safety",
          severity: "HIGH",
          description: "Heavy equipment in use - ensure designated operators and clear zones",
          detectionConfidence: obj.score,
        });
        hazardSet.add("heavy_equipment");
      }
    }
  }

  // Generic scene hazards based on type
  const sceneHazards = getSceneHazards(sceneType);
  for (const hazard of sceneHazards) {
    if (!hazardSet.has(hazard.item)) {
      hazards.push(hazard);
      hazardSet.add(hazard.item);
    }
  }

  return hazards.slice(0, 8); // Limit to 8 hazards max
}

function normalizeItemName(raw: string): string {
  return raw
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function getSceneHazards(sceneType: string): HazardInference[] {
  const baseHazards: Record<string, HazardInference[]> = {
    workshop: [
      { item: "Tool Storage", severity: "MEDIUM", description: "Ensure tools are properly stored and secured", detectionConfidence: 0.6 },
      { item: "Workbench Safety", severity: "MEDIUM", description: "Keep work area clean and uncluttered", detectionConfidence: 0.6 },
    ],
    lab: [
      { item: "Ventilation System", severity: "HIGH", description: "Verify fume hoods and chemical ventilation active", detectionConfidence: 0.65 },
      { item: "Chemical Storage", severity: "HIGH", description: "Confirm proper segregation and labeling of chemicals", detectionConfidence: 0.65 },
      { item: "Spill Kit Availability", severity: "MEDIUM", description: "Ensure spill kits are accessible and stocked", detectionConfidence: 0.6 },
    ],
    factory: [
      { item: "Machine Guards", severity: "HIGH", description: "All rotating machinery must have guards in place", detectionConfidence: 0.7 },
      { item: "Emergency Stop", severity: "HIGH", description: "Verify all E-stops are accessible and functional", detectionConfidence: 0.65 },
      { item: "Lockout/Tagout", severity: "HIGH", description: "LOTO procedures must be followed during maintenance", detectionConfidence: 0.65 },
    ],
    warehouse: [
      { item: "Load Securing", severity: "HIGH", description: "All stacked items must be secured properly", detectionConfidence: 0.68 },
      { item: "Aisle Clearance", severity: "MEDIUM", description: "Maintain clear aisles for equipment and emergency access", detectionConfidence: 0.62 },
      { item: "Racking Inspection", severity: "HIGH", description: "Check racking for damage, deformation, or overload", detectionConfidence: 0.67 },
    ],
    office: [
      { item: "Ergonomic Setup", severity: "LOW", description: "Ensure proper desk and chair positioning to prevent strain", detectionConfidence: 0.55 },
      { item: "Emergency Exits", severity: "MEDIUM", description: "Verify clear pathways to emergency exits", detectionConfidence: 0.6 },
    ],
    outdoor: [
      { item: "Weather Hazards", severity: "MEDIUM", description: "Monitor weather conditions and environmental hazards", detectionConfidence: 0.5 },
      { item: "Terrain Safety", severity: "MEDIUM", description: "Identify uneven surfaces and trip hazards", detectionConfidence: 0.55 },
    ],
  };

  return baseHazards[sceneType] || [{ item: "General Workspace Inspection", severity: "LOW", description: "Conduct routine safety walkthrough", detectionConfidence: 0.5 }];
}

export function generateFocusAreas(detectedObjects: DetectedObject[], inferredHazards: HazardInference[]): Array<{ x: number; y: number; width: number; height: number; label: string; severity: "HIGH" | "MEDIUM" | "LOW"; note: string }> {
  const focusAreas = [];

  // Map high/medium severity hazards to object bounding boxes
  const highPriorityObjects = detectedObjects.filter((obj) => {
    const hazard = inferredHazards.find(
      (h) => h.item.toLowerCase().includes(obj.class.toLowerCase()) || h.detectionConfidence === obj.score
    );
    return hazard && (hazard.severity === "HIGH" || hazard.severity === "MEDIUM");
  });

  for (const obj of highPriorityObjects.slice(0, 4)) {
    const [x1, y1, x2, y2] = obj.bbox;
    const x = Math.round(x1 * 100);
    const y = Math.round(y1 * 100);
    const width = Math.round((x2 - x1) * 100);
    const height = Math.round((y2 - y1) * 100);

    const hazard = inferredHazards.find((h) => h.detectionConfidence === obj.score);
    focusAreas.push({
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
      width: Math.max(5, Math.min(100 - x, width)),
      height: Math.max(5, Math.min(100 - y, height)),
      label: hazard?.item || normalizeItemName(obj.class),
      severity: hazard?.severity || "MEDIUM",
      note: hazard?.description || "Area requiring attention",
    });
  }

  return focusAreas;
}
