import Header from "@/app/components/Header";
import TripScreen from "@/app/components/TripScreen";

export default function TripPage() {
  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col relative">
      <Header section="s2 · what would you do" backHref="/sweet" />
      <TripScreen />
    </div>
  );
}
