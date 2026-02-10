import { NextRequest, NextResponse } from "next/server";
import type { AnalysisResult } from "@/lib/contracts";

export const runtime = "edge";

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

  const seed = hashString(`${file.name}-${file.size}-${width}-${height}-${platform}`);
  const rand = makeRand(seed);
  const issues = generateIssues(width, height, rand);

  const result: AnalysisResult = {
    image: { width, height },
    issues,
    meta: {
      low_quality_warning: width < 640 || height < 400,
      processing_ms: 900 + Math.floor(rand() * 1200)
    }
  };

  return NextResponse.json(result);
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
      title: "Primary CTA lacks visual priority",
      rationale: "The CTA blends with surrounding elements and loses attention.",
      recommendation: "Increase contrast and size to make the CTA dominant."
    },
    {
      category: "hierarchy",
      title: "Headline hierarchy is unclear",
      rationale: "Headline weight is similar to body text, reducing scanability.",
      recommendation: "Boost font size/weight for the primary headline."
    },
    {
      category: "layout",
      title: "Content density feels high",
      rationale: "Multiple blocks compete for attention at the same level.",
      recommendation: "Add spacing and group related blocks into clear sections."
    },
    {
      category: "accessibility",
      title: "Low contrast text area",
      rationale: "Text sits on a low-contrast background and is hard to read.",
      recommendation: "Increase contrast or adjust background brightness."
    }
  ] as const;

  const count = rand() < 0.15 ? 0 : 2 + Math.floor(rand() * 3);
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
