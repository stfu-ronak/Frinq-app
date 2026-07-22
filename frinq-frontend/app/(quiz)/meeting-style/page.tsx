import SinglePickPage from "@/app/components/SinglePickPage";

export default function MeetingStylePage() {
  return (
    <SinglePickPage
      question="when meeting new people, what feels most natural?"
      storageKey="frinq_meeting_style"
      trackPage="/meeting-style"
      backHref="/would-rather"
      nextHref="/story"
      options={[
        { value: "one-on-one", label: "talking one-on-one" },
        { value: "small",      label: "small group conversations" },
        { value: "large",      label: "being around larger groups" },
        { value: "depends",    label: "depends on the vibe" },
      ]}
    />
  );
}
