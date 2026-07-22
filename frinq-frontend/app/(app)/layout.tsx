import AccountGate from "@/app/components/AccountGate";
import AppTabBar from "@/app/components/AppTabBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AccountGate>
      <div className="min-h-dvh bg-[#F5F0E8] pb-24">
        {children}
      </div>
      <AppTabBar />
    </AccountGate>
  );
}
