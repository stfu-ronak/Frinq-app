import SinglePickPage from "@/app/components/SinglePickPage";

export default function ConnectionModePage() {
  return (
    <SinglePickPage
      question="you're most likely to connect with someone when..."
      storageKey="frinq_connection_mode"
      trackPage="/connection-mode"
      backHref="/travel-style"
      nextHref="/event-yes"
      options={[
        { value: "activity",   label: "we're doing an activity together" },
        { value: "deep-talk",  label: "we're talking deeply" },
        { value: "laughter",   label: "we're laughing a lot" },
        { value: "exploring",  label: "we're exploring something new" },
        { value: "group-vibe", label: "we're part of the same group vibe" },
      ]}
    />
  );
}
