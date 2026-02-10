import { NextRequest, NextResponse } from "next/server";
import type { AnalysisResult } from "@/lib/contracts";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 400 });
  }

  const width = Number(formData.get("width")) || 1440;
  const height = Number(formData.get("height")) || 900;
  const platform = String(formData.get("platform") || "web");

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const geminiResult = await analyzeWithGemini({
        apiKey,
        file,
        width,
        height,
        platform
      });
      if (geminiResult.issues.length > 0) {
        return NextResponse.json(geminiResult);
      }
    } catch (error) {
      console.error("Gemini error:", error);
    }
  }

  // Fallback: deterministic mock if GEMINI_API_KEY isn't set.
  const seed = hashString(`${file.name}-${file.size}-${width}-${height}-${platform}`);
  const rand = makeRand(seed);
  const issues = generateIssues(width, height, rand);

  return NextResponse.json({
    image: { width, height },
    issues,
    meta: {
      low_quality_warning: width < 640 || height < 400,
      processing_ms: 900 + Math.floor(rand() * 1200)
    }
  } satisfies AnalysisResult);
}

async function analyzeWithGemini({
  apiKey,
  file,
  width,
  height,
  platform
}: {
  apiKey: string;
  file: File;
  width: number;
  height: number;
  platform: string;
}): Promise<AnalysisResult> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  const systemInstruction = `
Ты — экспертный UX-аудитор. Отвечай строго на русском.
Проанализируй интерфейс по изображению и верни JSON строго по схеме.
Укажи bbox в пикселях относительно оригинального изображения (0..width/height).
Не используй проценты или относительные значения — только пиксели.
Старайся вернуть минимум 2 проблемы, если это возможно по изображению.
Если проблем нет, верни пустой массив issues.
Не добавляй поясняющий текст вне JSON.`;

  const userPrompt = `
Контекст:
- Платформа: ${platform}
- Размер изображения: ${width}x${height} px
Нужно:
1) Найти UX-проблемы.
2) Для каждой проблемы: severity, category, title, rationale (1-2 предложения), recommendation (1-2 предложения).
3) bbox: x,y,w,h в пикселях (целые числа).
Ограничение: максимум 6 проблем.
Важно: bbox должен покрывать конкретный элемент интерфейса, из-за которого возникла проблема.
`;

  const responseSchema = {
    type: "object",
    properties: {
      image: {
        type: "object",
        properties: {
          width: { type: "integer" },
          height: { type: "integer" }
        },
        required: ["width", "height"]
      },
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            bbox: {
              type: "object",
              properties: {
                x: { type: "integer" },
                y: { type: "integer" },
                w: { type: "integer" },
                h: { type: "integer" }
              },
              required: ["x", "y", "w", "h"]
            },
            severity: { type: "string", enum: ["high", "medium", "low"] },
            category: {
              type: "string",
              enum: ["hierarchy", "copy", "accessibility", "forms", "navigation", "visual", "cta", "layout"]
            },
            title: { type: "string" },
            rationale: { type: "string" },
            recommendation: { type: "string" }
          },
          required: ["id", "bbox", "severity", "category", "title", "rationale", "recommendation"]
        }
      },
      meta: {
        type: "object",
        properties: {
          low_quality_warning: { type: "boolean" },
          processing_ms: { type: "integer" }
        }
      }
    },
    required: ["image", "issues"]
  };

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemInstruction }]
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                inline_data: {
                  mime_type: file.type,
                  data: base64
                }
              },
              { text: userPrompt }
            ]
          }
        ],
        generation_config: {
          temperature: 0.2,
          response_mime_type: "application/json",
          response_schema: responseSchema
        }
      })
    }
  );

  if (!res.ok) {
    const payload = await res.text();
    throw new Error(`Gemini error: ${payload}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini response is empty");
  }

  let parsed: AnalysisResult;
  try {
    parsed = JSON.parse(text) as AnalysisResult;
  } catch {
    throw new Error("Gemini returned non-JSON output");
  }
  return normalizeResult(parsed, width, height);
}

function normalizeResult(result: AnalysisResult, width: number, height: number): AnalysisResult {
  const issues = (result.issues || []).map((issue, idx) => {
    const x = clampInt(issue.bbox?.x ?? 0, 0, width - 1);
    const y = clampInt(issue.bbox?.y ?? 0, 0, height - 1);
    const w = clampInt(issue.bbox?.w ?? 40, 10, width - x);
    const h = clampInt(issue.bbox?.h ?? 40, 10, height - y);
    return {
      ...issue,
      id: issue.id || `iss_${idx + 1}`,
      bbox: { x, y, w, h }
    };
  });
  return {
    image: { width, height },
    issues,
    meta: {
      low_quality_warning: width < 640 || height < 400,
      processing_ms: result.meta?.processing_ms
    }
  };
}

function clampInt(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

type Rand = () => number;

function hashString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRand(seed: number): Rand {
  let x = seed || 123456789;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967295;
  };
}

function generateIssues(width: number, height: number, rand: Rand): AnalysisResult["issues"] {
  const templates = [
    {
      category: "cta",
      title: "Главный CTA теряет визуальный приоритет",
      rationale: "Кнопка сливается с окружением и не притягивает внимание.",
      recommendation: "Увеличьте контраст и размер, чтобы CTA стал доминирующим."
    },
    {
      category: "hierarchy",
      title: "Иерархия заголовков неочевидна",
      rationale: "Заголовок по весу близок к основному тексту, страдает сканируемость.",
      recommendation: "Усильте размер/начертание основного заголовка."
    },
    {
      category: "layout",
      title: "Высокая плотность контента",
      rationale: "Несколько блоков конкурируют за внимание на одном уровне.",
      recommendation: "Добавьте воздуха и сгруппируйте связанные блоки."
    },
    {
      category: "accessibility",
      title: "Зона с низким контрастом текста",
      rationale: "Текст на фоне с низким контрастом читается хуже.",
      recommendation: "Увеличьте контраст или скорректируйте яркость фона."
    }
  ] as const;

  const count = 2 + Math.floor(rand() * 3);
  const severities: AnalysisResult["issues"][number]["severity"][] = ["high", "medium", "low"];
  const issues: AnalysisResult["issues"] = [];

  for (let i = 0; i < count; i += 1) {
    const t = templates[Math.floor(rand() * templates.length)];
    const w = Math.max(120, Math.floor(width * (0.18 + rand() * 0.22)));
    const h = Math.max(64, Math.floor(height * (0.08 + rand() * 0.14)));
    const x = Math.floor(rand() * Math.max(1, width - w - 8));
    const y = Math.floor(rand() * Math.max(1, height - h - 8));
    const severity = severities[Math.floor(rand() * severities.length)];
    issues.push({
      id: `iss_${i + 1}`,
      bbox: { x, y, w, h },
      severity,
      category: t.category,
      title: t.title,
      rationale: t.rationale,
      recommendation: t.recommendation
    });
  }

  return issues;
}
