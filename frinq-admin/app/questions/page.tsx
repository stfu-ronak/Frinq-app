"use client";

import { useAdminAuth } from "@/app/components/AdminShell";
import { QuestionsView } from "@/app/components/QuestionsView";

export default function QuestionsPage() {
  const { adminKey } = useAdminAuth();

  return (
    <div>
      <header className="border-b border-[rgba(42,24,16,0.1)] px-6 py-4 flex items-center justify-between">
        <span className="font-[family-name:var(--font-things)] text-[#2A1810] text-lg">questions</span>
      </header>
      <main className="px-6 py-6 max-w-4xl mx-auto">
        <QuestionsView adminKey={adminKey} />
      </main>
    </div>
  );
}
