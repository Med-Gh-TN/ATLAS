import React from "react";
import DOMPurify from "isomorphic-dompurify";
import { cn } from "@/lib/utils";

interface SanitizedHTMLProps extends React.HTMLAttributes<HTMLDivElement> {
  html: string;
}

export function SanitizedHTML({ html, className, ...props }: SanitizedHTMLProps) {
  // Purify the HTML string to remove malicious scripts
  const cleanHTML = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "b", "i", "em", "strong", "a", "p", "br", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "code", "pre"
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "class", "style"],
  });

  return (
    <div
      className={cn("prose prose-sm max-w-none dark:prose-invert", className)}
      dangerouslySetInnerHTML={{ __html: cleanHTML }}
      {...props}
    />
  );
}
