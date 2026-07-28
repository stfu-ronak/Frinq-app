import type { Metadata } from "next";
import "./globals.css";
import { AdminShell } from "./components/AdminShell";

export const metadata: Metadata = {
  title: "frinq admin",
  description: "Internal admin dashboard.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
