import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "UI Heatmap Scanner",
  description: "Upload a UI screenshot and get a UX heatmap with recommendations."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
