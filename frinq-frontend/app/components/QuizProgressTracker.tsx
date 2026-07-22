"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getQuizState, setQuizState } from "@/app/lib/storage";
import { apiFetch } from "@/app/lib/api";

function collectAnswers(): Record<string, unknown> {
  const safeJson = (key: string, fallback: unknown = []) => {
    try { return JSON.parse(getQuizState(key) ?? JSON.stringify(fallback)); }
    catch { return fallback; }
  };
  const ans: Record<string, unknown> = {};
  const strKeys: Record<string, string> = {
    frinq_name: "name", frinq_city: "city", frinq_dob: "dob",
    frinq_social_type: "social_type", frinq_saturday: "saturday",
    frinq_hobbies: "hobbies", frinq_connection: "connection",
    frinq_trip: "trip", frinq_show_up: "show_up",
    frinq_story: "story", frinq_looking_for: "looking_for",
    frinq_linkedin_url: "linkedin_url", frinq_instagram: "instagram",
    // New event-organizing fields (#13). dream_plan removed — was a
    // duplicate of event_yes.
    frinq_travel_style: "travel_style",
    frinq_connection_mode: "connection_mode",
    frinq_would_rather: "would_rather",
    frinq_meeting_style: "meeting_style",
  };
  for (const [ssKey, ansKey] of Object.entries(strKeys)) {
    const v = getQuizState(ssKey);
    if (v) ans[ansKey] = v;
  }
  const jsonKeys: Record<string, string> = {
    frinq_interests: "interests", frinq_red_flags: "red_flags",
    frinq_rapid: "rapid", frinq_opinions: "opinions",
    frinq_opinions_why: "opinions_why", frinq_scene: "scene",
    frinq_event_yes: "event_yes", frinq_event_no: "event_no",
  };
  for (const [ssKey, ansKey] of Object.entries(jsonKeys)) {
    const v = safeJson(ssKey);
    if (Array.isArray(v) && v.length > 0) ans[ansKey] = v;
  }
  return ans;
}

export default function QuizProgressTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // Track current page so we can resume on return
    setQuizState("frinq_current_page", pathname);

    const submissionId = getQuizState("frinq_submission_id");
    if (!submissionId) return;
    const answers = collectAnswers();
    if (Object.keys(answers).length === 0) return;

    apiFetch(`/api/v1/quiz/partial/${submissionId}`, {
      method: "PATCH",
      body: JSON.stringify({ answers, last_page: pathname }),
    }).catch(() => {});
  }, [pathname]);

  return null;
}
