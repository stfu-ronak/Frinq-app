import SinglePickPage from "@/app/components/SinglePickPage";

export default function WouldRatherPage() {
  return (
    <SinglePickPage
      question="with someone you click with, what would you rather do?"
      storageKey="frinq_would_rather"
      trackPage="/would-rather"
      backHref="/event-no"
      nextHref="/meeting-style"
      options={[
        { value: "build",    label: "build something together" },
        { value: "explore",  label: "explore something new together" },
        { value: "talk",     label: "talk for hours, no agenda" },
        { value: "compete",  label: "compete or play together" },
        { value: "vibe",     label: "just sit and exist together" },
      ]}
    />
  );
}
