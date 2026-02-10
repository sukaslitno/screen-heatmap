export type Severity = "high" | "medium" | "low";
export type Category =
  | "hierarchy"
  | "copy"
  | "accessibility"
  | "forms"
  | "navigation"
  | "visual"
  | "cta"
  | "layout";

export type AnalysisIssue = {
  id: string;
  bbox: { x: number; y: number; w: number; h: number };
  severity: Severity;
  category: Category;
  title: string;
  rationale: string;
  recommendation: string;
};

export type AnalysisResult = {
  image: { width: number; height: number };
  issues: AnalysisIssue[];
  meta?: {
    low_quality_warning?: boolean;
    processing_ms?: number;
  };
};
