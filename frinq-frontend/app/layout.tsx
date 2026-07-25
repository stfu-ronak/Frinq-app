import type { Metadata } from "next";
import "./globals.css";
import Tracker from "@/app/components/Tracker";

export const metadata: Metadata = {
  title: "frinq. find your frinq.",
  description: "The friend-matching questionnaire.",
  icons: {
    icon: [{ url: "/fq-logo.png", type: "image/png" }],
    apple: [{ url: "/fq-logo.png" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">
        {/* Consent-gated screen_view only (app/lib/analytics.ts) — off by
            default, no free-form properties. The unconditional Google
            Analytics/Microsoft Clarity scripts previously here (no consent
            gate, real session-replay tracking) were removed as part of
            Task 43's "browser analytics/session replay" cutover. */}
        <Tracker />
        {children}
      </body>
    </html>
  );
}
