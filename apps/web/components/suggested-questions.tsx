"use client";

interface Props {
  questions: string[];
  onPick: (q: string) => void;
}

/**
 * Chips gợi ý câu hỏi. Dùng trong Chat component khi history rỗng.
 */
export function SuggestedQuestions({ questions, onPick }: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        marginTop: 8,
      }}
    >
      {questions.map((q) => (
        <button
          key={q}
          type="button"
          className="ll-pill"
          onClick={() => onPick(q)}
        >
          {q}
        </button>
      ))}
    </div>
  );
}
