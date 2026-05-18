"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Loader2,
  MessageSquareQuote,
  Radar,
  SlidersHorizontal,
  Shield,
  Sparkles,
  Upload,
} from "lucide-react";

import type { AuditResult, FocusArea, Severity, StoredAudit } from "@/types/audit";

const SeverityChart = dynamic(
  () => import("@/components/severity-chart").then((mod) => mod.SeverityChart),
  { ssr: false }
);

type ApiAuditResult = AuditResult & { source?: string };

const HISTORY_KEY = "safesphere-history";
const INSPECTION_MODES = ["general", "workshop", "lab", "factory", "warehouse"] as const;

function formatModeLabel(mode: (typeof INSPECTION_MODES)[number]): string {
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function severityPill(severity: Severity): string {
  if (severity === "HIGH") return "bg-red-500/20 text-red-200 border-red-400/40";
  if (severity === "MEDIUM") return "bg-amber-500/20 text-amber-100 border-amber-300/40";
  return "bg-emerald-500/20 text-emerald-100 border-emerald-300/40";
}

function ringColor(score: number): string {
  if (score >= 85) return "#38d39f";
  if (score >= 60) return "#f59e0b";
  return "#f43f5e";
}

function getSeverityBreakdown(result: AuditResult | null) {
  const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  if (!result) return counts;
  for (const hazard of result.hazards) {
    counts[hazard.severity] += 1;
  }
  return counts;
}

function buildReportMarkdown(result: ApiAuditResult, sourceFile: string, mode: string, notes: string) {
  const lines = [
    "# SafeSphere AI Audit Report",
    "",
    `- File: ${sourceFile}`,
    `- Mode: ${mode}`,
    `- Source: ${result.source ?? "local-ml"}`,
    `- Generated: ${new Date(result.timestamp).toLocaleString()}`,
    `- Safety score: ${result.safetyScore}`,
    `- Status: ${result.environmentStatus}`,
    `- PPE: ${result.ppeCompliance}`,
    `- Confidence: ${Math.round(result.confidence * 100)}%`,
    "",
    "## Executive Summary",
    result.executiveSummary,
    "",
    "## Supervisor Notes",
    notes || "No additional notes provided.",
    "",
    "## Note Intelligence",
    ...(result.noteAnalysis
      ? [
          `- Intent: ${result.noteAnalysis.intent}`,
          `- Urgency: ${result.noteAnalysis.urgency}`,
          `- Detail score: ${Math.round(result.noteAnalysis.detailScore * 100)}%`,
          `- Entities: ${result.noteAnalysis.entities.join(", ") || "none"}`,
          `- Key phrases: ${result.noteAnalysis.keyPhrases.join(", ") || "none"}`,
          `- Follow-up questions: ${result.noteAnalysis.followUpQuestions.join(" | ") || "none"}`,
        ]
      : ["- No note analysis available"]),
    "",
    "## Hazards",
    ...result.hazards.map(
      (hazard, index) => `- ${index + 1}. [${hazard.severity}] ${hazard.item}: ${hazard.description}`
    ),
    "",
    "## Focus Areas",
    ...(result.focusAreas.length
      ? result.focusAreas.map(
          (area, index) =>
            `- ${index + 1}. ${area.label} (${area.severity}) at ${area.x}%,${area.y}% size ${area.width}% x ${area.height}% - ${area.note}`
        )
      : ["- None detected"]),
    "",
    "## Action Plan",
    ...result.actionPlan.map((step, index) => `- ${index + 1}. ${step}`),
  ];

  return lines.join("\n");
}

function FocusOverlay({ areas }: { areas: FocusArea[] }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {areas.map((area, index) => (
        <div
          key={`${area.label}-${index}`}
          className={`absolute rounded-2xl border ${severityPill(area.severity)} bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]`}
          style={{
            left: `${area.x}%`,
            top: `${area.y}%`,
            width: `${area.width}%`,
            height: `${area.height}%`,
          }}
        >
          <div className="absolute left-0 top-0 -translate-y-full rounded-md bg-slate-950/85 px-2 py-1 text-[10px] font-semibold tracking-wide text-white shadow-lg backdrop-blur">
            {area.label}
          </div>
          <div className="absolute bottom-0 left-0 translate-y-full rounded-md bg-black/75 px-2 py-1 text-[10px] leading-4 text-slate-100 backdrop-blur-sm">
            {area.note}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SafeSphereDashboard() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [audit, setAudit] = useState<ApiAuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [useMock, setUseMock] = useState(false);
  const [inspectionMode, setInspectionMode] = useState<(typeof INSPECTION_MODES)[number]>("general");
  const [analystNotes, setAnalystNotes] = useState("");
  const [checkedActions, setCheckedActions] = useState<number[]>([]);
  const [history, setHistory] = useState<StoredAudit[]>(() => {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as StoredAudit[];
    } catch {
      window.localStorage.removeItem(HISTORY_KEY);
      return [];
    }
  });
  const [selectedHistory, setSelectedHistory] = useState("");
  const [severityFilter, setSeverityFilter] = useState<"ALL" | Severity>("ALL");
  const [cameraOn, setCameraOn] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
      }
      if (previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const filteredHazards = useMemo(() => {
    if (!audit) return [];
    if (severityFilter === "ALL") return audit.hazards;
    return audit.hazards.filter((hazard) => hazard.severity === severityFilter);
  }, [audit, severityFilter]);

  const breakdown = useMemo(() => getSeverityBreakdown(audit), [audit]);

  const chartData = [
    { name: "High", value: breakdown.HIGH },
    { name: "Medium", value: breakdown.MEDIUM },
    { name: "Low", value: breakdown.LOW },
  ];

  const score = audit?.safetyScore ?? 0;
  const focusAreas = audit?.focusAreas ?? [];
  const hazardCount = audit?.hazards.length ?? 0;
  const focusCount = focusAreas.length;
  const riskTone = score >= 85 ? "text-emerald-300" : score >= 60 ? "text-amber-200" : "text-rose-300";

  const selectedPrevious = useMemo(
    () => history.find((item) => item.id === selectedHistory) ?? null,
    [history, selectedHistory]
  );

  async function startCamera() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraOn(true);
    } catch {
      setError("Camera access denied or unavailable.");
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    setCameraOn(false);
  }

  async function captureSnapshot() {
    if (!videoRef.current) return;

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return;

    const capture = new File([blob], `snapshot-${Date.now()}.jpg`, { type: "image/jpeg" });
    setFile(capture);
    setPreviewUrl(URL.createObjectURL(blob));
    setAudit(null);
    stopCamera();
  }

  function onFilePicked(nextFile: File | null) {
    if (!nextFile) return;
    setFile(nextFile);
    setAudit(null);
    setCheckedActions([]);
    if (previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(URL.createObjectURL(nextFile));
  }

  async function runAudit() {
    if (!file) {
      setError("Upload a file or capture a snapshot first.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("useMock", String(useMock));
      formData.append("mode", inspectionMode);
      formData.append("notes", analystNotes);

      const res = await fetch("/api/audit", {
        method: "POST",
        body: formData,
      });

      const json = (await res.json()) as ApiAuditResult | { error: string };
      if (!res.ok || "error" in json) {
        throw new Error("error" in json ? json.error : "Audit failed");
      }

      setAudit(json);
      setCheckedActions([]);

      const item: StoredAudit = {
        id: crypto.randomUUID(),
        fileName: file.name,
        previewUrl,
        result: json,
      };
      const next = [item, ...history].slice(0, 8);
      setHistory(next);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  function downloadReport() {
    if (!audit || !file) return;

    const report = buildReportMarkdown(audit, file.name, formatModeLabel(inspectionMode), analystNotes);
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `safesphere-report-${Date.now()}.md`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toggleAction(index: number) {
    setCheckedActions((current) =>
      current.includes(index) ? current.filter((value) => value !== index) : [...current, index]
    );
  }

  const circumference = 2 * Math.PI * 58;
  const offset = circumference - (score / 100) * circumference;
  const compareDelta = selectedPrevious && audit ? audit.safetyScore - selectedPrevious.result.safetyScore : null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070b12] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(27,125,180,0.24),transparent_38%),radial-gradient(circle_at_80%_0%,rgba(37,181,128,0.18),transparent_28%),linear-gradient(135deg,#05070d_0%,#091420_48%,#0a111a_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:32px_32px]" />

      <main className="relative mx-auto flex w-full max-w-[1300px] flex-col gap-6 px-4 py-6 md:px-8 lg:py-10">
        <motion.header
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-lg"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">SafeSphere AI</p>
              <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
                Intelligent Industrial Safety Auditor
              </h1>
              <p className="mt-1 text-sm text-slate-300">
                Multimodal Gemini analysis with strict JSON output for reliable compliance dashboards.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-3 rounded-xl border border-cyan-200/20 bg-cyan-100/10 px-3 py-2 text-sm text-cyan-50">
              <input
                type="checkbox"
                checked={useMock}
                onChange={(event) => setUseMock(event.target.checked)}
                className="h-4 w-4 accent-cyan-400"
              />
              Demo Mock Mode
            </label>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              { label: "Score", value: `${score}%`, tone: riskTone },
              { label: "Hazards", value: String(hazardCount), tone: "text-sky-100" },
              { label: "Focus Areas", value: String(focusCount), tone: "text-violet-100" },
              { label: "Mode", value: formatModeLabel(inspectionMode), tone: "text-cyan-100" },
              { label: "PPE", value: audit?.ppeCompliance ?? "N/A", tone: "text-amber-100" },
              { label: "Confidence", value: `${Math.round((audit?.confidence ?? 0) * 100)}%`, tone: "text-emerald-100" },
            ].map((metric) => (
              <div key={metric.label} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{metric.label}</div>
                <div className={`mt-2 text-lg font-semibold ${metric.tone}`}>{metric.value}</div>
              </div>
            ))}
          </div>
        </motion.header>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <motion.div
            initial={{ opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
            className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-lg"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-medium">Visual Input</h2>
              <div className="flex flex-wrap gap-2">
                {!cameraOn ? (
                  <button
                    onClick={startCamera}
                    className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/40 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-300/20"
                  >
                    <Camera className="h-4 w-4" />
                    Webcam
                  </button>
                ) : (
                  <>
                    <button
                      onClick={captureSnapshot}
                      className="inline-flex items-center gap-2 rounded-lg border border-emerald-300/40 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-300/20"
                    >
                      <Sparkles className="h-4 w-4" />
                      Capture
                    </button>
                    <button
                      onClick={stopCamera}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/25 px-3 py-2 text-sm text-slate-100 hover:bg-white/10"
                    >
                      Stop
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-[1fr_1.4fr]">
              <label className="rounded-xl border border-white/10 bg-white/5 p-3">
                <span className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-400">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Inspection Mode
                </span>
                <select
                  value={inspectionMode}
                  onChange={(event) => setInspectionMode(event.target.value as (typeof INSPECTION_MODES)[number])}
                  className="w-full rounded-md border border-white/10 bg-slate-950 p-2 text-sm"
                >
                  {INSPECTION_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {formatModeLabel(mode)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="rounded-xl border border-white/10 bg-white/5 p-3">
                <span className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-400">
                  <MessageSquareQuote className="h-3.5 w-3.5" />
                  Analyst Notes
                </span>
                <textarea
                  value={analystNotes}
                  onChange={(event) => setAnalystNotes(event.target.value)}
                  placeholder="Example: focus on loose wiring near the bench and PPE around the cutting station."
                  className="min-h-20 w-full resize-none rounded-md border border-white/10 bg-slate-950 p-2 text-sm placeholder:text-slate-500"
                />
              </label>
            </div>

            <label className="mb-4 flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/25 bg-white/5 p-5 text-center hover:border-cyan-300/50 hover:bg-cyan-300/5">
              <Upload className="h-6 w-6 text-cyan-200" />
              <span className="font-medium">Drop image/video or click to upload</span>
              <span className="text-xs text-slate-300">JPG, PNG, WEBP, MP4, WEBM</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                className="hidden"
                onChange={(event) => onFilePicked(event.target.files?.[0] ?? null)}
              />
            </label>

            <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
              {cameraOn ? (
                <div className="relative h-[300px] w-full">
                  <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                  {focusAreas.length > 0 && <FocusOverlay areas={focusAreas} />}
                </div>
              ) : previewUrl ? (
                <div className="relative h-[300px] w-full">
                  {file?.type.startsWith("video/") ? (
                    <video src={previewUrl} controls className="h-full w-full object-cover" />
                  ) : (
                    <Image
                      src={previewUrl}
                      alt="Workspace preview"
                      fill
                      unoptimized
                      className="object-cover"
                      sizes="(max-width: 1024px) 100vw, 60vw"
                    />
                  )}
                  {focusAreas.length > 0 && <FocusOverlay areas={focusAreas} />}
                </div>
              ) : (
                <div className="flex h-[300px] items-center justify-center text-sm text-slate-400">
                  Your captured or uploaded workspace will appear here.
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={runAudit}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-2 font-medium text-white disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                Run Safety Audit
              </button>
              <button
                onClick={downloadReport}
                disabled={!audit}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 font-medium text-slate-100 disabled:opacity-40"
              >
                <Download className="h-4 w-4" />
                Export Report
              </button>
              {error && <p className="text-sm text-rose-300">{error}</p>}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, delay: 0.2 }}
            className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-lg"
          >
            <h2 className="mb-4 text-lg font-medium">Audit Summary</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Safety Score</p>
                <div className="relative mx-auto mt-2 h-40 w-40">
                  <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
                    <circle cx="70" cy="70" r="58" stroke="rgba(255,255,255,0.12)" strokeWidth="10" fill="none" />
                    <circle
                      cx="70"
                      cy="70"
                      r="58"
                      stroke={ringColor(score)}
                      strokeWidth="10"
                      strokeDasharray={circumference}
                      strokeDashoffset={offset}
                      strokeLinecap="round"
                      fill="none"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-semibold">{score}%</span>
                    <span className="text-xs text-slate-300">Confidence {(audit?.confidence ?? 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Status</p>
                <p className="mt-3 text-sm font-medium text-cyan-100">{audit?.environmentStatus || "Awaiting analysis"}</p>
                <p className="mt-3 text-xs text-slate-300">PPE: {audit?.ppeCompliance || "N/A"}</p>
                <p className="mt-1 text-xs text-slate-300">
                  Source: {audit?.source === "mock" ? "Mock generator" : audit?.source ?? "-"}
                </p>
                {compareDelta !== null && (
                  <p className={`mt-3 text-xs ${compareDelta >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    Delta vs selected audit: {compareDelta > 0 ? `+${compareDelta}` : compareDelta}
                  </p>
                )}
                {audit?.uncertainty !== undefined && (
                  <div className="mt-3 space-y-1">
                    <p className="text-xs text-slate-300">ANN uncertainty: {Math.round(audit.uncertainty * 100)}%</p>
                    {audit.precisionScore !== undefined && (
                      <p className="text-xs text-cyan-300">ANN precision score: {Math.round(audit.precisionScore * 100)}%</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 h-44 rounded-xl border border-white/10 bg-white/5 p-3">
              <SeverityChart data={chartData} />
            </div>

            <div className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-4">
              <p className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-cyan-200/80">
                <Radar className="h-3.5 w-3.5" />
                Executive Summary
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-100/90">
                {audit?.executiveSummary || "Run an audit to generate an executive summary."}
              </p>
            </div>

            {audit?.moreInfoNeeded && audit.moreInfoNeeded.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-amber-100/80">More Info Needed</p>
                <ul className="mt-3 space-y-2 text-sm text-amber-50">
                  {audit.moreInfoNeeded.map((item, index) => (
                    <li key={`${item}-${index}`} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-200" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {audit?.noteAnalysis && (
              <div className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-4">
                <p className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-cyan-100/80">
                  <Sparkles className="h-3.5 w-3.5" />
                  Note Intelligence
                </p>
                <div className="mt-3 grid gap-2 text-sm text-cyan-50">
                  <p>Intent: {audit.noteAnalysis.intent}</p>
                  <p>Urgency: {audit.noteAnalysis.urgency}</p>
                  <p>Detail score: {Math.round(audit.noteAnalysis.detailScore * 100)}%</p>
                  <p>Entities: {audit.noteAnalysis.entities.join(", ") || "none"}</p>
                  <p>Key phrases: {audit.noteAnalysis.keyPhrases.slice(0, 5).join(", ") || "none"}</p>
                  <p className="text-cyan-100/80">{audit.noteAnalysis.summary}</p>
                </div>
              </div>
            )}

            {audit?.ensembleVotes && Object.values(audit.ensembleVotes).some(v => v > 0) && (
              <div className="mt-4 rounded-xl border border-violet-300/20 bg-violet-300/10 p-4">
                <p className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-violet-100/80">
                  <Sparkles className="h-3.5 w-3.5" />
                  Ensemble Model Consensus
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(audit.ensembleVotes)
                    .filter(([, votes]) => votes > 0)
                    .sort(([, voteA], [, voteB]) => voteB - voteA)
                    .slice(0, 4)
                    .map(([scene, votes]) => (
                      <div key={scene} className="rounded-lg border border-violet-400/30 bg-violet-500/10 px-2 py-1 text-violet-100">
                        <span className="capitalize">{scene}</span>
                        {votes === 3 && <span className="text-violet-300"> ✓✓✓</span>}
                        {votes === 2 && <span className="text-violet-300"> ✓✓</span>}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </motion.div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr_0.85fr]">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
            className="rounded-2xl border border-white/10 bg-black/30 p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-medium">Detected Hazards</h3>
              <div className="flex gap-2 text-xs">
                {(["ALL", "HIGH", "MEDIUM", "LOW"] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => setSeverityFilter(level)}
                    className={`rounded-md px-2 py-1 ${
                      severityFilter === level ? "bg-cyan-500/30 text-cyan-50" : "bg-white/5 text-slate-300"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {filteredHazards.length === 0 && (
                <p className="rounded-lg border border-emerald-300/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                  No hazards in current filter.
                </p>
              )}
              {filteredHazards.map((hazard, index) => (
                <div key={`${hazard.item}-${index}`} className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{hazard.item}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${severityPill(hazard.severity)}`}>
                      {hazard.severity}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">{hazard.description}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="rounded-2xl border border-white/10 bg-black/30 p-4"
          >
            <h3 className="mb-3 text-base font-medium">Immediate Action Plan</h3>
            <div className="space-y-2">
              {(audit?.actionPlan || []).map((step, index) => {
                const done = checkedActions.includes(index);
                return (
                  <label
                    key={`${step}-${index}`}
                    className={`flex cursor-pointer gap-2 rounded-lg border p-3 text-sm ${
                      done ? "border-emerald-300/50 bg-emerald-500/15" : "border-white/10 bg-white/5"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={() => toggleAction(index)}
                      className="mt-0.5 h-4 w-4 accent-emerald-400"
                    />
                    <span>{step}</span>
                  </label>
                );
              })}
            </div>

            {audit && (
              <div className="mt-4 rounded-lg border border-cyan-200/20 bg-cyan-300/10 p-3 text-xs text-cyan-50">
                <p className="font-medium">Positive Signals</p>
                <ul className="mt-1 space-y-1 text-cyan-100/90">
                  {audit.positives.map((positive, index) => (
                    <li key={`${positive}-${index}`} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5" />
                      <span>{positive}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="rounded-2xl border border-white/10 bg-black/30 p-4"
          >
            <h3 className="mb-3 text-base font-medium">Audit Timeline</h3>
            <select
              className="mb-3 w-full rounded-md border border-white/15 bg-slate-900 p-2 text-sm"
              value={selectedHistory}
              onChange={(event) => setSelectedHistory(event.target.value)}
            >
              <option value="">Compare with previous...</option>
              {history.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.fileName} | {new Date(item.result.timestamp).toLocaleTimeString()}
                </option>
              ))}
            </select>

            <div className="space-y-2">
              {history.length === 0 && <p className="text-sm text-slate-400">No previous audits yet.</p>}
              {history.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setAudit({ ...item.result, source: "mock" });
                    setPreviewUrl(item.previewUrl);
                  }}
                  className="w-full rounded-lg border border-white/10 bg-white/5 p-2 text-left text-xs hover:bg-white/10"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{item.fileName}</span>
                    <span className="text-slate-300">{item.result.safetyScore}%</span>
                  </div>
                  <span className="text-slate-400">{item.result.environmentStatus}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300">
          <span className="inline-flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Gemini multimodal + schema-enforced JSON pipeline
          </span>
          <span className="inline-flex items-center gap-2 text-slate-400">
            <AlertTriangle className="h-4 w-4" />
            AI guidance supports human supervisors, not a replacement for certified safety inspections.
          </span>
        </footer>
      </main>
    </div>
  );
}
