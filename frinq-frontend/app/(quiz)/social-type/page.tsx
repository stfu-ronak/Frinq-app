import Header from "@/app/components/Header";
import ImageCardGrid from "@/app/components/ImageCard";
import QuestionLabel from "@/app/components/QuestionLabel";

const cards = [
  {
    title: "introvert",
    body: "i like to be alone mostly. people drain my energy.",
    imgSrc: "/photos/social-type-2.png",
  },
  {
    title: "selective extrovert",
    body: "very selective about who i let in. everyone passes a filter.",
    imgSrc: "/photos/social-type-4.png",
  },
  {
    title: "ambivert",
    body: "i like people but i need my space equally. it's a balance.",
    imgSrc: "/photos/social-type-1.png",
  },
  {
    title: "extrovert",
    body: "people give me energy. alone too long and i start to unravel.",
    imgSrc: "/photos/social-type-3.png",
  },
];

export default function SocialTypePage() {
  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col relative">
      <Header section="s1 · who you are" backHref="/nahh" />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 pt-20 pb-4 md:px-[min(10vw,140px)]">
        <div className="animate-fade-up">
          <QuestionLabel>what is your social type?</QuestionLabel>
          <ImageCardGrid cards={cards} nextHref="/scene" storageKey="frinq_social_type" />
        </div>
      </main>
    </div>
  );
}
