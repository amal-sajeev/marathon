import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: true });

/** Render a small, safe subset of Markdown for chat messages. */
export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(text, { async: false }) as string;
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: [
        "p", "br", "strong", "em", "del", "code", "pre",
        "ul", "ol", "li", "a", "blockquote", "h1", "h2", "h3", "h4",
        "hr", "span",
      ],
      ALLOWED_ATTR: ["href", "title", "target", "rel"],
    });
  }, [text]);

  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
