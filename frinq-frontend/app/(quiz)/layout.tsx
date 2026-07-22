import { ReactNode } from "react";
import UrlMask from "@/app/components/UrlMask";
import QuizProgressTracker from "@/app/components/QuizProgressTracker";

export default function QuizLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <UrlMask />
      <QuizProgressTracker />
      {children}
    </>
  );
}
