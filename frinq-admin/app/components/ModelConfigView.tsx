"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/app/lib/adminFetch";
import { useAdminAuth } from "@/app/components/AdminShell";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type Step = "insights" | "deep_report";
const STEPS: { id: Step; label: string }[] = [
  { id: "insights", label: "primary · full summary + vibe card" },
  { id: "deep_report", label: "safe fallback · full summary + vibe card" },
];

interface ModelInfo {
  model_id: string;
  provider: "openai" | "claude" | "gemini";
  input_price_per_mtok: number;
  output_price_per_mtok: number;
  supports_effort: boolean;
  effort_levels: string[];
}

interface StepConfig {
  step: Step;
  provider: "openai" | "claude" | "gemini";
  model_id: string;
  effort: string | null;
  updated_at: string;
  updated_by: string;
}

interface UsageByModel {
  provider: string;
  model_id: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

interface UsageRecent {
  id: string;
  submission_id: string | null;
  step: string;
  provider: string;
  model_id: string;
  effort: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  created_at: string;
}

interface UsageSummary {
  total_cost_usd: number;
  total_calls: number;
  cost_today_usd: number;
  cost_this_week_usd: number;
  by_model: UsageByModel[];
  recent: UsageRecent[];
}

interface RuntimeSummary {
  logical_generation: string;
  primary: { provider: string; model_id: string; effort: string | null };
  fallback: { provider: string; model_id: string; effort: string | null };
  route: { active_route: string; primary_suppressed: boolean; cooldown_seconds: number; suppressed_until: string | null };
}

interface TestResult {
  ok: boolean;
  model_id: string;
  latency_ms: number;
  result?: Record<string, unknown>;
  error?: string;
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Per-step provider/model/effort picker, sourced entirely from the
 *  backend's available_models catalog (app/core/ai/model_pricing.py) — no
 *  pricing or effort-level lists duplicated client-side. */
function StepConfigCard({ step, label, config, models, onSave, saving, onTest, testing, testResult }: {
  step: Step;
  label: string;
  config: StepConfig;
  models: ModelInfo[];
  onSave: (step: Step, provider: string, modelId: string, effort: string | null) => void;
  saving: boolean;
  onTest: (step: Step, provider: string, modelId: string, effort: string | null) => void;
  testing: boolean;
  testResult: TestResult | null;
}) {
  const [provider, setProvider] = useState(config.provider);
  const [modelId, setModelId] = useState(config.model_id);
  const [effort, setEffort] = useState<string | null>(config.effort);

  // Re-sync local edit state whenever the server config changes (e.g. after
  // a successful save) — adjusted during render, not in an effect, matching
  // PasswordModal.tsx's existing prop-sync pattern in this codebase.
  const [synced, setSynced] = useState(config);
  if (synced !== config) {
    setSynced(config);
    setProvider(config.provider);
    setModelId(config.model_id);
    setEffort(config.effort);
  }

  const providerModels = useMemo(() => models.filter((m) => m.provider === provider), [models, provider]);
  const selected = useMemo(() => models.find((m) => m.model_id === modelId), [models, modelId]);

  function changeProvider(next: string) {
    setProvider(next as "openai" | "claude" | "gemini");
    const first = models.find((m) => m.provider === next);
    if (first) {
      setModelId(first.model_id);
      setEffort(first.supports_effort ? first.effort_levels[0] ?? null : null);
    }
  }

  function changeModel(next: string) {
    setModelId(next);
    const info = models.find((m) => m.model_id === next);
    if (info && !info.supports_effort) {
      setEffort(null);
    } else if (info && effort && !info.effort_levels.includes(effort)) {
      setEffort(info.effort_levels[0] ?? null);
    }
  }

  const dirty = provider !== config.provider || modelId !== config.model_id || effort !== config.effort;

  return (
    <div className="border border-[rgba(42,24,16,0.12)] rounded-md p-5 flex-1 min-w-[280px]">
      <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] uppercase text-[#8B7355] mb-1">{label}</p>
      <p className="font-[family-name:var(--font-motive)] text-[9px] text-[rgba(42,24,16,0.4)] mb-4">
        last updated {fmt(config.updated_at)} · by {config.updated_by}
      </p>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] uppercase text-[#8B7355]">provider</span>
          <select value={provider} onChange={(e) => changeProvider(e.target.value)}
            className="font-[family-name:var(--font-motive)] text-[11px] px-2 py-1.5 border border-[rgba(42,24,16,0.18)] bg-transparent text-[#2A1810]">
            <option value="openai">openai</option>
            <option value="claude">claude</option>
            <option value="gemini">gemini / gemma</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] uppercase text-[#8B7355]">model</span>
          <select value={modelId} onChange={(e) => changeModel(e.target.value)}
            className="font-[family-name:var(--font-motive)] text-[11px] px-2 py-1.5 border border-[rgba(42,24,16,0.18)] bg-transparent text-[#2A1810]">
            {providerModels.map((m) => (
              <option key={m.model_id} value={m.model_id}>
                {m.model_id} (${m.input_price_per_mtok.toFixed(2)}/${m.output_price_per_mtok.toFixed(2)} per MTok)
              </option>
            ))}
          </select>
        </label>

        {selected?.supports_effort ? (
          <label className="flex flex-col gap-1">
            <span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] uppercase text-[#8B7355]">effort</span>
            <select value={effort ?? ""} onChange={(e) => setEffort(e.target.value)}
              className="font-[family-name:var(--font-motive)] text-[11px] px-2 py-1.5 border border-[rgba(42,24,16,0.18)] bg-transparent text-[#2A1810]">
              {selected.effort_levels.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
            </select>
          </label>
        ) : (
          <p className="font-[family-name:var(--font-motive)] text-[9px] text-[rgba(42,24,16,0.4)]">
            this model has no configurable effort level
          </p>
        )}

        <button
          onClick={() => onSave(step, provider, modelId, selected?.supports_effort ? effort : null)}
          disabled={!dirty || saving || testing}
          className="mt-2 self-start font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(42,24,16,0.3)] text-[#2A1810] hover:bg-[rgba(42,24,16,0.05)] disabled:opacity-40">
          {saving ? "saving…" : "save"}
        </button>
        <button
          onClick={() => onTest(step, provider, modelId, selected?.supports_effort ? effort : null)}
          disabled={saving || testing || !selected}
          className="mt-2 self-start font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(124,28,11,0.3)] text-[#7C1C0B] hover:bg-[rgba(124,28,11,0.05)] disabled:opacity-40">
          {testing ? "testing..." : "test connection + output"}
        </button>
        {testResult && (
          <div className={`mt-2 p-2 border text-[10px] ${testResult.ok ? "border-[rgba(42,120,16,0.25)] text-[#2A7810]" : "border-[rgba(124,28,11,0.25)] text-[#7C1C0B]"}`} role="status">
            {testResult.ok ? `passed - ${testResult.latency_ms} ms - normalized ${Object.keys(testResult.result ?? {}).length} fields` : `failed - ${testResult.error ?? "provider error"}`}
          </div>
        )}
      </div>
    </div>
  );
}

export function ModelConfigView({ adminKey, onRequestPassword, onWrongPassword }: {
  adminKey: string;
  onRequestPassword: () => Promise<string | null>;
  onWrongPassword: () => void;
}) {
  const { logout } = useAdminAuth();
  const [configs, setConfigs] = useState<Record<Step, StepConfig> | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [configError, setConfigError] = useState<string | null>(null);
  const [savingStep, setSavingStep] = useState<Step | null>(null);
  const [testingStep, setTestingStep] = useState<Step | null>(null);
  const [testResults, setTestResults] = useState<Partial<Record<Step, TestResult>>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<RuntimeSummary | null>(null);

  const loadConfig = useCallback(async () => {
    if (!adminKey) return;
    setConfigError(null);
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin/ai-config`, {}, { key: adminKey });
      if (res.status === 401) { logout(); return; }
      if (!res.ok) { setConfigError(`error ${res.status}`); return; }
      const data = await res.json();
      const byStep: Record<string, StepConfig> = {};
      for (const c of data.configs || []) byStep[c.step] = c;
      setConfigs(byStep as Record<Step, StepConfig>);
      setModels(data.available_models || []);
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : "network error");
    }
  }, [adminKey, logout]);

  const loadUsage = useCallback(async () => {
    if (!adminKey) return;
    setUsageError(null);
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin/ai-usage`, {}, { key: adminKey });
      if (res.status === 401) { logout(); return; }
      if (!res.ok) { setUsageError(`error ${res.status}`); return; }
      setUsage(await res.json());
    } catch (e) {
      setUsageError(e instanceof Error ? e.message : "network error");
    }
  }, [adminKey, logout]);

  const loadRuntime = useCallback(async () => {
    if (!adminKey) return;
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin/ai-runtime`, {}, { key: adminKey });
      if (res.status === 401) { logout(); return; }
      if (res.ok) setRuntime(await res.json());
    } catch {
      // Advisory poll; a transient status failure must not disable model controls.
    }
  }, [adminKey, logout]);

  useEffect(() => {
    queueMicrotask(() => { loadConfig(); loadUsage(); loadRuntime(); });
    const refresh = window.setInterval(() => {
      if (document.visibilityState === "visible") { loadUsage(); loadRuntime(); }
    }, 30_000);
    return () => window.clearInterval(refresh);
  }, [loadConfig, loadUsage, loadRuntime]);

  async function saveConfig(step: Step, provider: string, modelId: string, effort: string | null) {
    const pwd = await onRequestPassword();
    if (!pwd) return;
    setSavingStep(step);
    setFeedback(null);
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin/ai-config/${step}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, model_id: modelId, effort }) },
        { key: adminKey, pwd });
      if (res.status === 401) { logout(); return; }
      if (res.status === 403) {
        onWrongPassword();
        setFeedback("wrong action password — try again");
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setFeedback(`failed: ${d.detail || res.status}`);
        return;
      }
      const updated: StepConfig = await res.json();
      setConfigs((prev) => (prev ? { ...prev, [step]: updated } : prev));
      setFeedback(`${step === "insights" ? "primary summary" : "safe fallback"} model updated — one combined generation call, next job onward`);
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "network error");
    } finally {
      setSavingStep(null);
      setTimeout(() => setFeedback(null), 6000);
    }
  }

  async function testConnection(step: Step, provider: string, modelId: string, effort: string | null) {
    const pwd = await onRequestPassword();
    if (!pwd) return;
    setTestingStep(step);
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin/ai-test`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "summary", provider, model_id: modelId, effort }) },
        { key: adminKey, pwd });
      if (res.status === 401) { logout(); return; }
      if (res.status === 403) { onWrongPassword(); setFeedback("wrong action password â€” try again"); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTestResults((prev) => ({ ...prev, [step]: { ok: false, model_id: modelId, latency_ms: 0, error: data.detail || `error ${res.status}` } }));
        return;
      }
      setTestResults((prev) => ({ ...prev, [step]: data }));
    } catch (e) {
      setTestResults((prev) => ({ ...prev, [step]: { ok: false, model_id: modelId, latency_ms: 0, error: e instanceof Error ? e.message : "network error" } }));
    } finally {
      setTestingStep(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px] mb-1">generation models</p>
        <p className="font-[family-name:var(--font-motive)] text-[10px] text-[#8B7355] mb-5">
          Choose one primary model for the complete summary + vibe card. The safe fallback is used only after a primary failure or during its short cooldown.
        </p>

        {configError && <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#7C1C0B] mb-4" role="alert">{configError}</p>}
        {feedback && <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#2A7810] mb-4" role="status">{feedback}</p>}

        {configs && (
          <div className="flex flex-wrap gap-4">
            {STEPS.map(({ id, label }) => (
              <StepConfigCard key={id} step={id} label={label} config={configs[id]} models={models}
                onSave={saveConfig} saving={savingStep === id}
                onTest={testConnection} testing={testingStep === id} testResult={testResults[id] ?? null} />
            ))}
          </div>
        )}
        {runtime && (
          <div className="mt-4 border border-[rgba(42,24,16,0.12)] rounded-md p-4" role="status">
            <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] uppercase text-[#8B7355] mb-1">live route</p>
            <p className="font-[family-name:var(--font-things)] text-[13px] text-[#2A1810]">
              {runtime.route.active_route === "primary" ? "primary active" : "fallback active — primary cooling down"}
            </p>
            <p className="font-[family-name:var(--font-motive)] text-[10px] text-[rgba(42,24,16,0.55)] mt-1">
              One model generates the complete summary and vibe card. Fallback cooldown: {runtime.route.cooldown_seconds}s.
            </p>
          </div>
        )}
      </section>

      <section>
        <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px] mb-4">usage &amp; cost</p>
        {usageError && <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#7C1C0B] mb-4" role="alert">{usageError}</p>}
        {usage && (
          <>
            <div className="flex flex-wrap gap-4 mb-6">
              {[
                ["all-time spend", fmtUsd(usage.total_cost_usd)],
                ["all-time calls", String(usage.total_calls)],
                ["today", fmtUsd(usage.cost_today_usd)],
                ["last 7 days", fmtUsd(usage.cost_this_week_usd)],
              ].map(([lbl, val]) => (
                <div key={lbl} className="border border-[rgba(42,24,16,0.12)] rounded-md px-4 py-3 min-w-[140px]">
                  <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] uppercase text-[#8B7355] mb-1">{lbl}</p>
                  <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[20px]">{val}</p>
                </div>
              ))}
            </div>

            {usage.by_model.length > 0 && (
              <div className="mb-6 overflow-x-auto">
                <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] uppercase text-[#8B7355] mb-2">spend by model</p>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[rgba(42,24,16,0.12)]">
                      {["model", "calls", "input tok", "output tok", "cost"].map((h) => (
                        <th key={h} className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] uppercase text-[#8B7355] py-2 pr-4">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {usage.by_model.map((m) => (
                      <tr key={`${m.provider}:${m.model_id}`} className="border-b border-[rgba(42,24,16,0.06)]">
                        <td className="font-[family-name:var(--font-things)] text-[#2A1810] text-[12px] py-2 pr-4">{m.provider}/{m.model_id}</td>
                        <td className="font-[family-name:var(--font-things)] text-[#2A1810] text-[12px] py-2 pr-4">{m.calls}</td>
                        <td className="font-[family-name:var(--font-things)] text-[#2A1810] text-[12px] py-2 pr-4">{m.input_tokens.toLocaleString()}</td>
                        <td className="font-[family-name:var(--font-things)] text-[#2A1810] text-[12px] py-2 pr-4">{m.output_tokens.toLocaleString()}</td>
                        <td className="font-[family-name:var(--font-things)] text-[#2A1810] text-[12px] py-2 pr-4">{fmtUsd(m.cost_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {usage.recent.length > 0 && (
              <div className="overflow-x-auto">
                <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] uppercase text-[#8B7355] mb-2">recent calls</p>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[rgba(42,24,16,0.12)]">
                      {["when", "step", "model", "effort", "cost"].map((h) => (
                        <th key={h} className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] uppercase text-[#8B7355] py-2 pr-4">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {usage.recent.map((r) => (
                      <tr key={r.id} className="border-b border-[rgba(42,24,16,0.06)]">
                        <td className="font-[family-name:var(--font-things)] text-[#2A1810] text-[12px] py-2 pr-4">{fmt(r.created_at)}</td>
                        <td className="font-[family-name:var(--font-things)] text-[#2A1810] text-[12px] py-2 pr-4">{r.step}</td>
                        <td className="font-[family-name:var(--font-things)] text-[#2A1810] text-[12px] py-2 pr-4">{r.provider}/{r.model_id}</td>
                        <td className="font-[family-name:var(--font-things)] text-[#2A1810] text-[12px] py-2 pr-4">{r.effort ?? "—"}</td>
                        <td className="font-[family-name:var(--font-things)] text-[#2A1810] text-[12px] py-2 pr-4">{fmtUsd(r.cost_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {usage.by_model.length === 0 && (
              <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#8B7355]">no AI usage recorded yet.</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
