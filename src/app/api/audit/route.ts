import { NextResponse } from "next/server";

import { enrichAuditLocally } from "@/lib/local-enricher";
import { buildMockAudit } from "@/lib/mock-audit";
import { runLocalAudit } from "@/lib/local-ml-pipeline";
import type { AuditResult } from "@/types/audit";

const GEMINI_MODEL = "gemini-2.5-flash";

const allowedMime = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"];

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

    const fileBytes = await file.arrayBuffer();
    const buffer = Buffer.from(fileBytes);

    let localResult: AuditResult | null = null;
    try {
      localResult = await runLocalAudit(buffer, inspectionMode, notes);
    } catch (localError) {
      console.warn("Local ML analysis warning:", localError);
    }

    let finalResult: AuditResult;
    let source = "local-ml";

    if (useMock || !localResult) {
      finalResult = buildMockAudit(`${file.name}-${inspectionMode}-${notes}`);
      source = "mock";
    } else {
      finalResult = enrichAuditLocally(localResult, {
        inspectionMode,
        notes,
        fileName: file.name,
      });

      // Gemini remains namesake-only metadata by request; no trust or merge logic is used.
      source = `local-ml + local-enriched (gemini namesake: ${GEMINI_MODEL})`;
    }

    return NextResponse.json({ ...finalResult, source });
  } catch (error) {
    console.error("Audit failed", error);
    return NextResponse.json({ error: "Failed to analyze file." }, { status: 500 });
  }
}
