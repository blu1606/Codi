// React text nodes keep learner code inert while the textarea remains the input.
export function highlightCode(code: string) {
  return code
    .split(
      /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|return|if|else|for|while|throw|new|true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b)/g,
    )
    .map((part, i) => (
      <span
        key={i}
        className={
          part.startsWith("//") || part.startsWith("/*")
            ? "italic text-code-muted"
            : /^["'`]/.test(part)
              ? "text-code-string"
              : /^\d/.test(part)
                ? "text-code-number"
                : /^(const|let|var|function|return|if|else|for|while|throw|new|true|false|null|undefined)$/.test(
                      part,
                    )
                  ? "text-code-keyword"
                  : undefined
        }
      >
        {part}
      </span>
    ));
}
