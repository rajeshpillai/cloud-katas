import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type LessonContentProps = {
  content: string;
};

export function LessonContent({ content }: LessonContentProps) {
  return (
    <article className="lesson-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </article>
  );
}
