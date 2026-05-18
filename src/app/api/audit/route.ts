import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

import { buildMockAudit } from "@/lib/mock-audit";
import type { AuditResult, Severity } from "@/types/audit";

const GEMINI_MODEL = "gemini-2.5-flash";

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const allowedMime = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"];

const inspectionModes = new Set(["general", "workshop", "lab", "factory", "warehouse"]);

const safetySchema = {
  type: Type.OBJECT,
  properties: {
    safetyScore: {
      type: Type.INTEGER,
      description: "Overall safety rating from 0 to 100 based on visible conditions.",
    },
    environmentStatus: {
      type: Type.STRING,
      description: "Concise summary phrase such as CRITICAL HAZARDS DETECTED or COMPLIANT.",
    },
    executiveSummary: {
      type: Type.STRING,
      description: "One-paragraph executive summary of the workspace state.",
    },
    hazards: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          item: { type: Type.STRING },
          severity: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] },
          description: { type: Type.STRING },
        },
        required: ["item", "severity", "description"],
      },
    },
    focusAreas: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          severity: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] },
          x: { type: Type.INTEGER, description: "Left offset percentage from 0 to 100." },
          y: { type: Type.INTEGER, description: "Top offset percentage from 0 to 100." },
          width: { type: Type.INTEGER, description: "Bounding box width percentage from 0 to 100." },
          height: { type: Type.INTEGER, description: "Bounding box height percentage from 0 to 100." },
          note: { type: Type.STRING },
        },
        required: ["label", "severity", "x", "y", "width", "height", "note"],
      },
    },
    actionPlan: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Explicit step-by-step instructions to resolve hazards.",
    },
    ppeCompliance: {
      type: Type.STRING,
      description: "One of COMPLIANT, PARTIAL, or NON-COMPLIANT.",
    },
    positives: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Good practices observed in the workspace.",
    },
    confidence: {
      type: Type.NUMBER,
      description: "Confidence value from 0.0 to 1.0.",
    },
  },
  required: [
    "safetyScore",
    "environmentStatus",
    "executiveSummary",
    "hazards",
    "focusAreas",
    "actionPlan",
    "ppeCompliance",
    "positives",
    "confidence",
  ],
};

function toBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString("base64");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeSeverity(value: string): Severity {
  const clean = value.toUpperCase().trim();
  if (clean === "HIGH" || clean === "MEDIUM" || clean === "LOW") {
    return clean;
  }
  return "MEDIUM";
}

function normalizePercent(value: number): number {
  return clamp(Number.isFinite(value) ? value : 0, 0, 100);
}

function normalizeAudit(input: Partial<AuditResult>): AuditResult {
  return {
    safetyScore: clamp(Number(input.safetyScore ?? 0), 0, 100),
    environmentStatus: (input.environmentStatus || "ATTENTION REQUIRED").toUpperCase(),
    executiveSummary:
      input.executiveSummary || "The workspace requires review before it can be considered ready for safe operation.",
    hazards: (input.hazards || []).map((hazard) => ({
      item: hazard.item || "Unspecified hazard",
      severity: normalizeSeverity(hazard.severity || "MEDIUM"),
      description: hazard.description || "No details provided.",
    })),
    focusAreas: (input.focusAreas || []).map((focusArea) => ({
      label: focusArea.label || "Attention area",
      severity: normalizeSeverity(focusArea.severity || "MEDIUM"),
      x: normalizePercent(Number(focusArea.x ?? 0)),
      y: normalizePercent(Number(focusArea.y ?? 0)),
      width: normalizePercent(Number(focusArea.width ?? 20)),
      height: normalizePercent(Number(focusArea.height ?? 16)),
      note: focusArea.note || "Visible concern.",
    })),
    actionPlan: (input.actionPlan || []).filter(Boolean),
    ppeCompliance: (input.ppeCompliance || "PARTIAL").toUpperCase(),
    positives: (input.positives || []).filter(Boolean),
    confidence: clamp(Number(input.confidence ?? 0.75), 0, 1),
    timestamp: new Date().toISOString(),
  };
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const useMock = formData.get("useMock") === "true";
    const inspectionMode = String(formData.get("mode") || "general").toLowerCase();
    const notes = String(formData.get("notes") || "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }

    if (!allowedMime.includes(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file type. Upload JPG, PNG, WEBP, MP4, or WEBM." },
        { status: 400 }
      );
    }

    if (useMock || !ai) {
      const mockResult = buildMockAudit(`${file.name}-${inspectionMode}-${notes}`);
      return NextResponse.json({ ...mockResult, source: "mock" });
    }

    const fileBytes = await file.arrayBuffer();
    const modePrompt = inspectionModes.has(inspectionMode) ? inspectionMode : "general";
    const contextPrompt = notes
      ? `The supervisor added this context: ${notes}`
      : "No extra supervisor notes were provided.";

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Analyze this ${modePrompt} workspace for visible hazards, PPE compliance, machinery safety, and setup issues. Return strict JSON matching schema. ${contextPrompt} Also identify approximate focus areas in normalized percentages for where attention should be drawn in the image.`,
            },
            {
              inlineData: {
                mimeType: file.type,
                data: toBase64(fileBytes),
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: safetySchema,
        temperature: 0.2,
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    const normalized = normalizeAudit(parsed as Partial<AuditResult>);
    return NextResponse.json({ ...normalized, source: "gemini" });
  } catch (error) {
    console.error("Audit failed", error);
    return NextResponse.json(
      {
        error: "Failed to audit file.",
      },
      { status: 500 }
    );
  }
}
