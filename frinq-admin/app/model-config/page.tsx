"use client";

import { useCallback, useState } from "react";
import { useAdminAuth } from "@/app/components/AdminShell";
import { ModelConfigView } from "@/app/components/ModelConfigView";
import PasswordModal from "@/app/components/PasswordModal";

export default function ModelConfigPage() {
  const { adminKey } = useAdminAuth();

  const [actionPassword, setActionPassword] = useState("");
  const [pwdModal, setPwdModal] = useState<{ resolve: (p: string | null) => void } | null>(null);

  const requestPassword = useCallback((): Promise<string | null> => {
    if (actionPassword) return Promise.resolve(actionPassword);
    return new Promise<string | null>((resolve) => setPwdModal({ resolve }));
  }, [actionPassword]);

  return (
    <div>
      <header className="border-b border-[rgba(42,24,16,0.1)] px-6 py-4 flex items-center justify-between">
        <span className="font-[family-name:var(--font-things)] text-[#2A1810] text-lg">model config</span>
      </header>

      <main className="px-6 py-6 max-w-4xl mx-auto">
        <ModelConfigView adminKey={adminKey}
          onRequestPassword={async () => {
            const pwd = await requestPassword();
            if (pwd) setActionPassword(pwd);
            return pwd;
          }}
          onWrongPassword={() => setActionPassword("")}
        />
      </main>

      <PasswordModal
        open={!!pwdModal}
        onSubmit={(p) => { setActionPassword(p); pwdModal?.resolve(p); setPwdModal(null); }}
        onCancel={() => { pwdModal?.resolve(null); setPwdModal(null); }}
      />
    </div>
  );
}
