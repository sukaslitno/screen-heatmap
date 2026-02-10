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

  // Placeholder analysis for MVP skeleton.
  const result: AnalysisResult = {
    image: { width: 1440, height: 900 },
    issues: [
      {
        id: "iss_001",
        bbox: { x: 120, y: 240, w: 320, h: 120 },
        severity: "high",
        category: "cta",
        title: "Primary CTA lacks visual priority",
        rationale: "The CTA blends with surrounding elements and loses attention.",
        recommendation: "Increase contrast and size to make the CTA dominant."
      },
      {
        id: "iss_002",
        bbox: { x: 40, y: 80, w: 240, h: 64 },
        severity: "medium",
        category: "hierarchy",
        title: "Headline hierarchy is unclear",
        rationale: "Headline weight is similar to body text, reducing scanability.",
        recommendation: "Boost font size/weight for the primary headline."
      }
    ],
    meta: {
      low_quality_warning: false,
      processing_ms: 1820
    }
  };

  return NextResponse.json(result);
}
