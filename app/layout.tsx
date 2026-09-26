import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resource Planner — GT: New Horizons",
  description:
    "Plan production diagrams, connect recipes, and calculate machine ratios.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
