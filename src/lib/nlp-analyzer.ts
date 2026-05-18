import { BayesClassifier, PorterStemmer, TfIdf, WordTokenizer } from "natural";

import type { NoteAnalysis, NoteIntent, NoteUrgency } from "@/types/audit";
import type { SceneType } from "./image-classifier";

const tokenizer = new WordTokenizer();
let cachedClassifier: BayesClassifier | null = null;

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "but",
  "by",
  "for",
  "from",
  "has",
  "have",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "please",
  "show",
  "that",
  "the",
  "their",
  "this",
  "to",
  "was",
  "we",
  "with",
  "you",
  "your",
]);

const INTENT_EXAMPLES: Record<NoteIntent, string[]> = {
  immediate_action: [
    "stop work immediately and isolate the area",
    "shut down the machine and evacuate the room",
    "lock out the equipment now before anyone enters",
    "critical hazard needs urgent supervisor action",
  ],
  clarify_context: [
    "need another angle because this view is unclear",
    "retake with better lighting and closer focus",
    "the image is blurry so we need more context",
    "please capture a wider shot of the area",
  ],
  equipment_status: [
    "check whether the machine is running or locked out",
    "confirm guard status on the saw and grinder",
    "verify conveyor and forklift operation status",
    "inspect the electrical cable and powered tools",
  ],
  chemical_safety: [
    "confirm chemical containers and spill containment",
    "check fume hood status and ventilation",
    "verify whether acids or solvents are present",
    "look for unlabeled chemicals and PPE near the bench",
  ],
  ppe_review: [
    "confirm goggles gloves respirator and lab coat",
    "check if personal protective equipment is being worn",
    "verify PPE compliance around the cutting station",
    "ask whether eye protection is available",
  ],
  visibility_issue: [
    "lighting is poor and shadows are hiding hazards",
    "the scene is too dark to inspect clearly",
    "retake the image with brighter lighting",
    "there is glare and occlusion in the frame",
  ],
  housekeeping: [
    "remove clutter and secure loose tools",
    "clear the walkway and tidy the workstation",
    "there is poor housekeeping and blocked access",
    "organize cables and keep the area clean",
  ],
  scene_hint: [
    "this looks like a lab with chemicals and glassware",
    "this looks like a factory with machinery",
    "this is a warehouse with forklifts and racking",
    "this is a workshop with tools and benches",
  ],
  incident_report: [
    "there was a near miss and the area needs review",
    "a spill occurred and the area should be contained",
    "there was smoke sparking or an impact event",
    "record the incident and escalate to a supervisor",
  ],
  general_observation: [
    "the workspace should be checked for safety issues",
    "review the visible hazards and confirm the setup",
    "capture a clearer image and add more context",
    "the current note is descriptive but needs detail",
  ],
};

const ENTITY_GROUPS: Array<{ topic: string; terms: string[]; questions: string[]; risk: string }> = [
  {
    topic: "chemical",
    terms: ["chemical", "spill", "acid", "solvent", "toxic", "lab", "fume hood", "container"],
    questions: ["Which chemicals are present?", "Is the fume hood active?"],
    risk: "chemical exposure",
  },
  {
    topic: "ppe",
    terms: ["ppe", "goggles", "glove", "respirator", "mask", "helmet", "lab coat", "face shield"],
    questions: ["Which PPE is missing?", "Are protective items available?"],
    risk: "PPE compliance",
  },
  {
    topic: "equipment",
    terms: ["machine", "equipment", "guard", "saw", "grinder", "forklift", "conveyor", "lockout", "tagout"],
    questions: ["Which equipment should be checked first?", "Is lockout/tagout active?"],
    risk: "equipment status",
  },
  {
    topic: "housekeeping",
    terms: ["clutter", "cable", "walkway", "trip", "storage", "tool", "blocked", "mess", "debris"],
    questions: ["Which area needs to be cleared?", "Are walkways blocked?"],
    risk: "housekeeping",
  },
  {
    topic: "visibility",
    terms: ["dark", "shadow", "blur", "blurry", "glare", "occlusion", "lighting", "brighten"],
    questions: ["Can the image be retaken with better lighting?"],
    risk: "visibility",
  },
  {
    topic: "incident",
    terms: ["incident", "near miss", "injury", "smoke", "spark", "evacuate", "shutdown", "urgent"],
    questions: ["Was anyone injured or exposed?", "Should the area be shut down now?"],
    risk: "incident escalation",
  },
];

const SCENE_HINTS: Array<{ scene: SceneType; terms: string[] }> = [
  { scene: "lab", terms: ["lab", "laboratory", "chemical", "fume hood", "beaker", "pipette"] },
  { scene: "factory", terms: ["factory", "machinery", "production", "assembly", "conveyor", "grinder"] },
  { scene: "warehouse", terms: ["warehouse", "forklift", "racking", "pallet", "loading", "stock"] },
  { scene: "workshop", terms: ["workshop", "bench", "saw", "tool", "wood", "metal"] },
  { scene: "office", terms: ["office", "desk", "computer", "chair", "ergonomic"] },
  { scene: "outdoor", terms: ["outdoor", "yard", "parking", "outside"] },
];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenizeText(text: string): string[] {
  return tokenizer
    .tokenize(text)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function getClassifier(): BayesClassifier {
  if (cachedClassifier) return cachedClassifier;

  const classifier = new BayesClassifier(PorterStemmer, 1.2);
  for (const [intent, examples] of Object.entries(INTENT_EXAMPLES) as Array<[NoteIntent, string[]]>) {
    for (const example of examples) {
      classifier.addDocument(example, intent);
    }
  }
  classifier.train();
  cachedClassifier = classifier;
  return classifier;
}

function scoreUrgency(text: string, tokens: string[]): { urgency: NoteUrgency; score: number; signals: string[] } {
  const urgentTerms = ["immediately", "urgent", "critical", "now", "shutdown", "evacuate", "stop", "asap"];
  const highTerms = ["missing", "exposed", "sparking", "spill", "smoke", "injury", "locked", "blocked"];
  const mediumTerms = ["check", "confirm", "review", "monitor", "verify"];

  let score = 0;
  const signals: string[] = [];

  for (const term of urgentTerms) {
    if (text.includes(term)) {
      score += 0.22;
      signals.push(term);
    }
  }
  for (const term of highTerms) {
    if (text.includes(term)) {
      score += 0.12;
      signals.push(term);
    }
  }
  for (const term of mediumTerms) {
    if (tokens.includes(term)) {
      score += 0.04;
    }
  }

  if (/[A-Z]{4,}/.test(text)) {
    score += 0.08;
    signals.push("caps emphasis");
  }
  if (text.includes("!") || text.includes("??")) {
    score += 0.08;
    signals.push("strong punctuation");
  }

  score = clamp01(score);
  if (score >= 0.7) return { urgency: "CRITICAL", score, signals };
  if (score >= 0.45) return { urgency: "HIGH", score, signals };
  if (score >= 0.2) return { urgency: "MEDIUM", score, signals };
  return { urgency: "LOW", score, signals };
}

function extractEntities(text: string): { entities: string[]; topics: string[]; questions: string[]; signals: string[] } {
  const entities = new Set<string>();
  const topics = new Set<string>();
  const questions: string[] = [];
  const signals = new Set<string>();

  for (const group of ENTITY_GROUPS) {
    const matchedTerms = group.terms.filter((term) => text.includes(term));
    if (matchedTerms.length > 0) {
      topics.add(group.topic);
      signals.add(group.risk);
      questions.push(...group.questions);
      for (const term of matchedTerms) {
        entities.add(term);
      }
    }
  }

  return {
    entities: Array.from(entities),
    topics: Array.from(topics),
    questions,
    signals: Array.from(signals),
  };
}

function detectSceneHint(text: string): SceneType | "general" | "unknown" {
  for (const hint of SCENE_HINTS) {
    if (hint.terms.some((term) => text.includes(term))) {
      return hint.scene;
    }
  }
  return text.length > 0 ? "general" : "unknown";
}

function extractKeyPhrases(tokens: string[], entities: string[]): string[] {
  const tfidf = new TfIdf();
  tfidf.setTokenizer(tokenizer);
  tfidf.setStopwords(Array.from(STOPWORDS));
  tfidf.addDocument(tokens.join(" "));

  const terms = tfidf
    .listTerms(0)
    .map((term) => term.term)
    .filter((term) => term.length > 1)
    .slice(0, 8);

  const biGrams: string[] = [];
  for (let index = 0; index < Math.max(0, tokens.length - 1); index += 1) {
    biGrams.push(`${tokens[index]} ${tokens[index + 1]}`);
  }

  const triGrams: string[] = [];
  for (let index = 0; index < Math.max(0, tokens.length - 2); index += 1) {
    triGrams.push(`${tokens[index]} ${tokens[index + 1]} ${tokens[index + 2]}`);
  }

  const phraseCandidates = [...entities, ...terms, ...biGrams, ...triGrams];
  const scored = phraseCandidates
    .map((phrase) => ({
      phrase,
      score: (phrase.split(" ").length * 0.15) + (entities.includes(phrase) ? 0.4 : 0) + (tokens.includes(phrase) ? 0.25 : 0),
    }))
    .sort((left, right) => right.score - left.score)
    .map((item) => item.phrase);

  return Array.from(new Set(scored)).slice(0, 8);
}

function inferIntent(text: string): { intent: NoteIntent; confidence: number } {
  const classifier = getClassifier();
  const classifications = classifier.getClassifications(text);
  const best = classifications[0];
  const runnerUp = classifications[1];
  const intent = (best?.label as NoteIntent) || "general_observation";
  const confidence = clamp01((best?.value ?? 0) - Math.max(0, (runnerUp?.value ?? 0) * 0.25));
  return { intent, confidence };
}

function buildActionItems(intent: NoteIntent, entities: string[], sceneHint: string): string[] {
  const base = [...INTENT_EXAMPLES[intent].slice(0, 2)];
  if (entities.length > 0) {
    base.unshift(`Review the specific context around ${entities.slice(0, 2).join(" and ")}.`);
  }
  if (sceneHint !== "general" && sceneHint !== "unknown") {
    base.push(`Validate the note against the ${sceneHint} workspace setup.`);
  }
  return Array.from(new Set(base)).slice(0, 4);
}

function buildFollowUps(intent: NoteIntent, questions: string[], sceneHint: string, detailScore: number): string[] {
  const followUps = [...questions];

  if (detailScore < 0.45) {
    followUps.push("Can you specify the exact area, equipment, or hazard that matters most?");
  }
  if (sceneHint === "general" || sceneHint === "unknown") {
    followUps.push("Which facility type applies here: lab, factory, warehouse, workshop, office, or outdoor?");
  }
  if (intent === "clarify_context") {
    followUps.push("Should the next capture be closer, brighter, or from another angle?");
  }

  return Array.from(new Set(followUps)).slice(0, 5);
}

export function analyzeSupervisorNotes(notes: string, inspectionMode: string, sceneHint?: SceneType | "general" | "unknown"): NoteAnalysis {
  const normalizedText = normalizeText(notes);
  if (!normalizedText) {
    return {
      originalText: notes,
      normalizedText,
      intent: "general_observation",
      intentConfidence: 0,
      urgency: "LOW",
      detailScore: 0,
      keyPhrases: [],
      entities: [],
      topics: [],
      extractedActions: ["Add supervisor notes to guide the audit model."],
      followUpQuestions: [
        `What should the audit focus on in this ${inspectionMode} inspection?`,
        "Which hazard, machine, or area needs closer review?",
      ],
      riskSignals: [],
      summary: "No supervisor notes were provided, so the audit relies mainly on visual signals.",
      sceneHint: sceneHint ?? "general",
      shouldEscalate: false,
      noteWeight: 0,
      riskBoost: 0,
    };
  }

  const tokens = tokenizeText(normalizedText);
  const intent = inferIntent(normalizedText);
  const urgency = scoreUrgency(normalizedText, tokens);
  const entityResult = extractEntities(normalizedText);
  const detectedScene = sceneHint && sceneHint !== "general" && sceneHint !== "unknown" ? sceneHint : detectSceneHint(normalizedText);
  const keyPhrases = extractKeyPhrases(tokens, entityResult.entities);
  const detailScore = clamp01(tokens.length / 24 + entityResult.entities.length * 0.11 + keyPhrases.length * 0.03 + intent.confidence * 0.22);
  const riskBoost = clamp01(urgency.score * 0.22 + entityResult.topics.length * 0.07 + (entityResult.signals.includes("incident escalation") ? 0.18 : 0));
  const extractedActions = buildActionItems(intent.intent, entityResult.entities, detectedScene);
  const followUpQuestions = buildFollowUps(intent.intent, entityResult.questions, detectedScene, detailScore);
  const summaryParts = [
    `intent ${intent.intent.replace(/_/g, " ")}`,
    `urgency ${urgency.urgency.toLowerCase()}`,
  ];
  if (entityResult.topics.length > 0) {
    summaryParts.push(`topics ${entityResult.topics.join(", ")}`);
  }
  if (detectedScene && detectedScene !== "general" && detectedScene !== "unknown") {
    summaryParts.push(`scene hint ${detectedScene}`);
  }

  return {
    originalText: notes,
    normalizedText,
    intent: intent.intent,
    intentConfidence: intent.confidence,
    urgency: urgency.urgency,
    detailScore,
    keyPhrases,
    entities: entityResult.entities,
    topics: entityResult.topics,
    extractedActions,
    followUpQuestions,
    riskSignals: Array.from(new Set([...urgency.signals, ...entityResult.signals])),
    summary: `Supervisor note parsed. ${summaryParts.join(", ")}.`,
    sceneHint: detectedScene,
    shouldEscalate: urgency.urgency === "CRITICAL" || intent.intent === "immediate_action",
    noteWeight: clamp01(detailScore * 0.55 + intent.confidence * 0.25 + urgency.score * 0.2),
    riskBoost,
  };
}