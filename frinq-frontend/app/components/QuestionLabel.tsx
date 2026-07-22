interface Props {
  children: React.ReactNode;
}

export default function QuestionLabel({ children }: Props) {
  return (
    <h1
      className="font-[family-name:var(--font-things)] text-[#2A1810] tracking-wide leading-[1.1] mb-4"
      style={{ fontSize: "clamp(20px, 4vw, 36px)" }}
    >
      {children}
    </h1>
  );
}
