"use client";

import { useMemo, useRef, useState } from "react";
import type { AnalysisResult, AnalysisIssue, Severity } from "@/lib/contracts";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

const steps = [
  "Анализ структуры",
  "Поиск UX-проблем",
  "Формирование рекомендаций"
];

type Screen = "landing" | "upload" | "processing" | "results";

type ContextData = {
  platform: "web" | "mobile" | "";
  screenType: "form" | "checkout" | "catalog" | "promo" | "other" | "";
};

export default function Page() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [context, setContext] = useState<ContextData>({ platform: "", screenType: "" });
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [filterHigh, setFilterHigh] = useState(false);
  const [hoverIssue, setHoverIssue] = useState<AnalysisIssue | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const canAnalyze = Boolean(file && context.platform && context.screenType && !error);

  const filteredIssues = useMemo(() => {
    if (!result) return [];
    return result.issues
      .filter((issue) => (filterHigh ? issue.severity === "high" : true))
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  }, [result, filterHigh]);

  function severityRank(s: Severity) {
    if (s === "high") return 0;
    if (s === "medium") return 1;
    return 2;
  }

  function resetAll() {
    setScreen("upload");
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setContext({ platform: "", screenType: "" });
    setError(null);
    setWarning(null);
    setResult(null);
    setFilterHigh(false);
    setHoverIssue(null);
  }

  function validateAndSetFile(next: File) {
    setError(null);
    setWarning(null);
    if (!ALLOWED.includes(next.type)) {
      setError("Неподдерживаемый тип файла. Разрешены png, jpg, webp.");
      return;
    }
    if (next.size > MAX_BYTES) {
      setError("Файл слишком большой. Лимит 8 MB.");
      return;
    }
    const url = URL.createObjectURL(next);
    setFile(next);
    setPreviewUrl(url);

    const img = new Image();
    img.onload = () => {
      if (img.width < 640 || img.height < 400) {
        setWarning("Низкое качество изображения. Результаты могут быть неточными.");
      }
    };
    img.src = url;
  }

  async function startAnalysis() {
    if (!file) return;
    setScreen("processing");
    setError(null);
    setResult(null);
    setLoadingStep(0);

    const interval = window.setInterval(() => {
      setLoadingStep((prev) => (prev + 1) % steps.length);
    }, 1200);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("platform", context.platform);
      form.append("screenType", context.screenType);

      const res = await fetch("/api/analyze", {
        method: "POST",
        body: form
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Ошибка анализа");
      }

      const data = (await res.json()) as AnalysisResult;
      setResult(data);
      setScreen("results");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ошибка анализа";
      setError(message);
      setScreen("processing");
    } finally {
      window.clearInterval(interval);
    }
  }

  return (
    <main>
      <div className="container">
        <div className="header">
          <div className="brand">UI Heatmap Scanner</div>
          {screen !== "landing" && (
            <button className="ghost" onClick={() => setScreen("upload")}>Назад</button>
          )}
        </div>

        {screen === "landing" && (
          <section className="card">
            <h1>Сканируй UI и находи UX-проблемы</h1>
            <p>Загрузи один скриншот и получи тепловую карту проблем с рекомендациями.</p>
            <button className="cta" onClick={() => setScreen("upload")}>Загрузить скрин</button>
          </section>
        )}

        {screen === "upload" && (
          <section className="grid">
            <div className="col-7">
              <div className="card">
                <h3>Скрин интерфейса</h3>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const next = e.target.files?.[0];
                    if (next) validateAndSetFile(next);
                  }}
                />
                {previewUrl && (
                  <div style={{ marginTop: 16 }}>
                    <img
                      src={previewUrl}
                      alt="Preview"
                      style={{ maxWidth: "100%", borderRadius: 12, border: "1px solid var(--border)" }}
                    />
                  </div>
                )}
                {error && <p style={{ color: "var(--high)" }}>{error}</p>}
                {warning && <p style={{ color: "var(--medium)" }}>{warning}</p>}
              </div>
            </div>
            <div className="col-5">
              <div className="card">
                <h3>Контекст</h3>
                <label>Платформа</label>
                <select
                  value={context.platform}
                  onChange={(e) => setContext((prev) => ({ ...prev, platform: e.target.value as ContextData["platform"] }))}
                >
                  <option value="">Выберите</option>
                  <option value="web">Web</option>
                  <option value="mobile">Mobile</option>
                </select>
                <label style={{ display: "block", marginTop: 12 }}>Тип экрана</label>
                <select
                  value={context.screenType}
                  onChange={(e) => setContext((prev) => ({ ...prev, screenType: e.target.value as ContextData["screenType"] }))}
                >
                  <option value="">Выберите</option>
                  <option value="form">Form</option>
                  <option value="checkout">Checkout</option>
                  <option value="catalog">Catalog</option>
                  <option value="promo">Promo</option>
                  <option value="other">Other</option>
                </select>
                <div style={{ marginTop: 20 }}>
                  <button className="cta" disabled={!canAnalyze} onClick={startAnalysis}>
                    Запустить анализ
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {screen === "processing" && (
          <section className="card" style={{ textAlign: "center" }}>
            <h2>Анализируем…</h2>
            <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 16 }}>
              {steps.map((step, index) => (
                <span
                  key={step}
                  className="badge"
                  style={{
                    background: index === loadingStep ? "var(--accent)" : "#f1ece4",
                    color: index === loadingStep ? "white" : "var(--muted)"
                  }}
                >
                  {step}
                </span>
              ))}
            </div>
            {error && (
              <div style={{ marginTop: 20 }}>
                <p style={{ color: "var(--high)" }}>{error}</p>
                <button className="cta" onClick={startAnalysis}>Повторить</button>
              </div>
            )}
          </section>
        )}

        {screen === "results" && result && (
          <section className="grid">
            <div className="col-7">
              <div className="card" style={{ position: "relative" }}>
                <h3>Тепловая карта</h3>
                {previewUrl ? (
                  <div style={{ position: "relative" }}>
                    <img
                      ref={imgRef}
                      src={previewUrl}
                      alt="Result"
                      style={{ width: "100%", borderRadius: 12, border: "1px solid var(--border)" }}
                    />
                    {result.issues.map((issue) => (
                      <div
                        key={issue.id}
                        className={`overlay ${issue.severity}`}
                        style={bboxToStyle(issue, imgRef.current)}
                        onMouseEnter={() => setHoverIssue(issue)}
                        onMouseLeave={() => setHoverIssue(null)}
                      />
                    ))}
                    {hoverIssue && (
                      <div
                        className="tooltip"
                        style={{ left: 16, top: 12 }}
                      >
                        <strong>{hoverIssue.title}</strong>
                        <div>{hoverIssue.rationale}</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p>Нет изображения</p>
                )}
              </div>
            </div>
            <div className="col-5">
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3>Проблемы</h3>
                  <select value={filterHigh ? "high" : "all"} onChange={(e) => setFilterHigh(e.target.value === "high")}>
                    <option value="all">Все</option>
                    <option value="high">Только High</option>
                  </select>
                </div>
                {filteredIssues.length === 0 ? (
                  <div>
                    <p><strong>Критичных проблем не найдено.</strong></p>
                    <ul>
                      <li>Проверь иерархию заголовков и основного CTA.</li>
                      <li>Убедись, что контраст соответствует accessibility.</li>
                      <li>Сократи шум и второстепенные элементы.</li>
                    </ul>
                  </div>
                ) : (
                  filteredIssues.map((issue) => (
                    <div key={issue.id} className="issue">
                      <div className={`severity-${issue.severity}`}>{issue.severity.toUpperCase()}</div>
                      <h4>{issue.title}</h4>
                      <p>{issue.rationale}</p>
                      <p><strong>Что сделать:</strong> {issue.recommendation}</p>
                    </div>
                  ))
                )}
                <button className="ghost" onClick={resetAll}>Проанализировать другой экран</button>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function bboxToStyle(issue: AnalysisIssue, imgEl: HTMLImageElement | null) {
  if (!imgEl) return { display: "none" } as const;
  const { naturalWidth, naturalHeight } = imgEl;
  const rect = imgEl.getBoundingClientRect();
  const scaleX = rect.width / naturalWidth;
  const scaleY = rect.height / naturalHeight;
  return {
    left: issue.bbox.x * scaleX,
    top: issue.bbox.y * scaleY,
    width: issue.bbox.w * scaleX,
    height: issue.bbox.h * scaleY
  };
}
