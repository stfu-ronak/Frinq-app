import SinglePickPage from "@/app/components/SinglePickPage";

export default function TravelStylePage() {
  return (
    <SinglePickPage
      question="when you go somewhere new, you usually..."
      storageKey="frinq_travel_style"
      trackPage="/travel-style"
      backHref="/trip"
      nextHref="/connection-mode"
      options={[
        { value: "research",  label: "research beforehand" },
        { value: "on-the-spot", label: "figure things out on the spot" },
        { value: "follow",    label: "follow whoever planned it" },
        { value: "random",    label: "explore randomly" },
      ]}
    />
  );
}
