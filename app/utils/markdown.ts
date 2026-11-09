/**
 * Markdown <-> HTML converter and renderer for Kurban Reports Editor.
 * Supports full Markdown syntax (headings, bold, italic, strikethrough, highlight,
 * bullet & numbered lists, checklists, blockquotes, tables, code blocks, links, horizontal rules)
 * while seamlessly handling legacy HTML content stored in initial seed/database records.
 */

/**
 * Converts HTML-formatted report content into clean, editable Markdown
 * when opening a section in the editor. If the content is already Markdown,
 * returns it as-is.
 */
export function htmlToMarkdown(input: string): string {
  if (!input || !input.trim()) return "";

  // Check if input contains block/inline HTML tags that should be converted to Markdown
  const hasHtmlTags = /<\/?(?:p|div|h[1-6]|ul|ol|li|strong|b|em|i|br|hr|blockquote|span)\b[^>]*>/i.test(
    input
  );
  if (!hasHtmlTags) {
    return input;
  }

  let md = input;

  // Normalize line breaks inside HTML
  md = md.replace(/\r\n/g, "\n");

  // Convert headings
  md = md.replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, (_, inner) => `\n# ${cleanInlineHtml(inner)}\n`);
  md = md.replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, (_, inner) => `\n## ${cleanInlineHtml(inner)}\n`);
  md = md.replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, (_, inner) => `\n### ${cleanInlineHtml(inner)}\n`);
  md = md.replace(/<h4\b[^>]*>([\s\S]*?)<\/h4>/gi, (_, inner) => `\n#### ${cleanInlineHtml(inner)}\n`);

  // Convert blockquotes
  md = md.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner) => {
    const lines = cleanInlineHtml(inner)
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return "\n" + lines.map((l) => `> ${l}`).join("\n") + "\n";
  });

  // Convert ordered lists
  md = md.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
    let idx = 1;
    const items = inner.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (__: string, liInner: string) => {
      return `${idx++}. ${cleanInlineHtml(liInner)}\n`;
    });
    return `\n${items.trim()}\n\n`;
  });

  // Convert unordered lists
  md = md.replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) => {
    const items = inner.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (__: string, liInner: string) => {
      return `- ${cleanInlineHtml(liInner)}\n`;
    });
    return `\n${items.trim()}\n\n`;
  });

  // Standalone <li> (if outside ul/ol)
  md = md.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, inner) => `- ${cleanInlineHtml(inner)}\n`);

  // Convert paragraphs and divs
  md = md.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_, inner) => `\n${cleanInlineHtml(inner)}\n\n`);
  md = md.replace(/<div\b[^>]*>([\s\S]*?)<\/div>/gi, (_, inner) => `\n${cleanInlineHtml(inner)}\n`);

  // Convert horizontal rules and line breaks
  md = md.replace(/<hr\b[^>]*\/?>/gi, "\n---\n");
  md = md.replace(/<br\b[^>]*\/?>/gi, "\n");

  // Clean remaining inline tags
  md = cleanInlineHtml(md);

  // Collapse 3+ consecutive newlines into 2
  md = md
    .split("\n")
    .map((line) => line.replace(/^[ \t]+/, (spaces) => (spaces.length >= 6 ? "" : spaces)))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return md;
}

function cleanInlineHtml(str: string): string {
  let s = str;
  // Bold
  s = s.replace(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, "**$1**");
  // Italic
  s = s.replace(/<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, "*$1*");
  // Strikethrough
  s = s.replace(/<(?:del|s|strike)\b[^>]*>([\s\S]*?)<\/(?:del|s|strike)>/gi, "~~$1~~");
  // Inline code
  s = s.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");
  // Links
  s = s.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");
  // Spans (preserve inner text, bold if font-bold)
  s = s.replace(/<span\b[^>]*class=["'][^"']*font-bold[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi, "**$1**");
  s = s.replace(/<span\b[^>]*>([\s\S]*?)<\/span>/gi, "$1");
  // Decode basic HTML entities
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
  return s.trim();
}

/**
 * Formats inline Markdown syntax within a line or table cell.
 */
function formatInlineMarkdown(text: string): string {
  if (!text) return "";

  let out = text;

  // Inline code `code`
  out = out.replace(
    /`([^`]+)`/g,
    '<code class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 font-mono text-[11px] border border-slate-200 dark:border-slate-700">$1</code>'
  );

  // Images ![alt](url)
  out = out.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1" class="max-w-full h-auto rounded-xl my-2 border border-slate-200 shadow-xs inline-block" />'
  );

  // Links [label](url)
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-emerald-600 dark:text-emerald-400 underline font-semibold hover:text-emerald-700">$1</a>'
  );

  // Bold + Italic ***text*** or ___text___
  out = out.replace(/\*\*\*([\s\S]+?)\*\*\*/g, '<strong class="font-bold italic text-slate-900 dark:text-slate-100">$1</strong>');
  out = out.replace(/___([\s\S]+?)___/g, '<strong class="font-bold italic text-slate-900 dark:text-slate-100">$1</strong>');

  // Bold **text** or __text__
  out = out.replace(/\*\*([\s\S]+?)\*\*/g, '<strong class="font-bold text-slate-900 dark:text-slate-100">$1</strong>');
  out = out.replace(/__([\s\S]+?)__/g, '<strong class="font-bold text-slate-900 dark:text-slate-100">$1</strong>');

  // Italic *text* or _text_
  out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em class="italic">$1</em>');
  out = out.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<em class="italic">$1</em>');

  // Strikethrough ~~text~~
  out = out.replace(/~~([\s\S]+?)~~/g, '<del class="line-through text-slate-400">$1</del>');

  // Highlight ==text==
  out = out.replace(
    /==([\s\S]+?)==/g,
    '<mark class="bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 px-1 py-0.5 rounded font-semibold">$1</mark>'
  );

  return out;
}

/**
 * Renders Markdown (or hybrid Markdown + HTML) into clean, styled HTML
 * suitable for Kurban Official Reports, Live Previews, and Print/PDF output.
 */
export function renderMarkdownToHtml(input?: string | null): string {
  if (!input || !input.trim()) return "";

  const normalized = input.replace(/\r\n/g, "\n").trim();

  // If input is purely legacy block HTML without markdown patterns, still run inline markdown on it
  const isPureLegacyHtml =
    /^<(?:div|p|ul|ol|table|h[1-6])\b/i.test(normalized) &&
    !/^(?:#{1,6}\s|[-*+]\s|\d+\.\s|>\s|\|)/m.test(normalized);

  if (isPureLegacyHtml) {
    return formatInlineMarkdown(normalized);
  }

  // Extract fenced code blocks ```lang ... ``` first
  const codeBlocks: string[] = [];
  const withCodePlaceholders = normalized.replace(
    /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g,
    (_, _lang, code) => {
      const escaped = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const idx = codeBlocks.length;
      codeBlocks.push(
        `<pre class="bg-slate-900 text-slate-100 p-3.5 rounded-xl text-xs font-mono overflow-x-auto my-2.5 border border-slate-800"><code>${escaped.trim()}</code></pre>`
      );
      return `@@CODE_BLOCK_${idx}@@`;
    }
  );

  const lines = withCodePlaceholders.split("\n");
  const htmlBlocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Empty line
    if (!trimmed) {
      i++;
      continue;
    }

    // 2. Code block placeholder
    const codeMatch = trimmed.match(/^@@CODE_BLOCK_(\d+)@@$/);
    if (codeMatch) {
      htmlBlocks.push(codeBlocks[Number(codeMatch[1])]);
      i++;
      continue;
    }

    // 3. Horizontal Rule (---, ***, ___)
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      htmlBlocks.push('<hr class="my-3 border-t border-slate-200 dark:border-slate-700" />');
      i++;
      continue;
    }

    // 4. Headings (# to ####)
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = formatInlineMarkdown(headingMatch[2].trim());
      if (level === 1) {
        htmlBlocks.push(
          `<h1 class="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight mt-2 mb-1.5">${content}</h1>`
        );
      } else if (level === 2) {
        htmlBlocks.push(
          `<h2 class="text-sm sm:text-base font-extrabold text-slate-800 dark:text-slate-200 mt-2 mb-1">${content}</h2>`
        );
      } else if (level === 3) {
        htmlBlocks.push(
          `<h3 class="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 mt-1.5 mb-1">${content}</h3>`
        );
      } else {
        htmlBlocks.push(
          `<h4 class="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mt-1.5 mb-0.5">${content}</h4>`
        );
      }
      i++;
      continue;
    }

    // 5. Markdown Table (| col1 | col2 | followed by | --- | --- |)
    if (
      trimmed.startsWith("|") &&
      i + 1 < lines.length &&
      /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(lines[i + 1])
    ) {
      const parseCells = (rowStr: string) =>
        rowStr
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());

      const headers = parseCells(trimmed);
      const alignments = parseCells(lines[i + 1]).map((sep) => {
        if (sep.startsWith(":") && sep.endsWith(":")) return "text-center";
        if (sep.endsWith(":")) return "text-right";
        return "text-left";
      });

      i += 2;
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        bodyRows.push(parseCells(lines[i]));
        i++;
      }

      const theadHtml = headers
        .map(
          (h, idx) =>
            `<th class="p-2 border-b border-slate-200 dark:border-slate-700 ${alignments[idx] || "text-left"}">${formatInlineMarkdown(h)}</th>`
        )
        .join("");

      const tbodyHtml = bodyRows
        .map(
          (row) =>
            `<tr class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">${headers
              .map(
                (_, colIdx) =>
                  `<td class="p-2 border-b border-slate-100 dark:border-slate-800 ${alignments[colIdx] || "text-left"}">${formatInlineMarkdown(row[colIdx] || "")}</td>`
              )
              .join("")}</tr>`
        )
        .join("");

      htmlBlocks.push(
        `<div class="overflow-x-auto my-2.5"><table class="w-full text-xs border border-slate-200 dark:border-slate-700 border-collapse"><thead class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold"><tr>${theadHtml}</tr></thead><tbody class="divide-y divide-slate-100 dark:divide-slate-800">${tbodyHtml}</tbody></table></div>`
      );
      continue;
    }

    // 6. Blockquotes (> text)
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      const quoteHtml = quoteLines.map((q) => formatInlineMarkdown(q)).join("<br />");
      htmlBlocks.push(
        `<blockquote class="border-l-4 border-emerald-500 pl-3.5 py-2 my-2 bg-emerald-50/60 dark:bg-emerald-950/30 text-slate-700 dark:text-slate-300 italic rounded-r-xl">${quoteHtml}</blockquote>`
      );
      continue;
    }

    // 7. Unordered List (- item, * item, + item, including task lists - [x] / - [ ])
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[-*+]\s+/, "");
        const taskChecked = itemText.match(/^\[([xX])\]\s+(.+)$/);
        const taskUnchecked = itemText.match(/^\[\s\]\s+(.+)$/);

        if (taskChecked) {
          items.push(
            `<li class="list-none -ml-4 flex items-start gap-2"><span class="inline-flex items-center justify-center w-4 h-4 rounded bg-emerald-600 text-white text-[10px] font-bold shrink-0 mt-0.5">✓</span><span>${formatInlineMarkdown(taskChecked[2])}</span></li>`
          );
        } else if (taskUnchecked) {
          items.push(
            `<li class="list-none -ml-4 flex items-start gap-2"><span class="inline-flex items-center justify-center w-4 h-4 rounded border border-slate-300 dark:border-slate-600 text-transparent text-[10px] shrink-0 mt-0.5">•</span><span>${formatInlineMarkdown(taskUnchecked[1])}</span></li>`
          );
        } else {
          items.push(`<li>${formatInlineMarkdown(itemText)}</li>`);
        }
        i++;
      }
      htmlBlocks.push(`<ul class="list-disc pl-5 my-2 space-y-1">${items.join("")}</ul>`);
      continue;
    }

    // 8. Ordered List (1. item, 2. item)
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+\.\s+/, "");
        items.push(`<li>${formatInlineMarkdown(itemText)}</li>`);
        i++;
      }
      htmlBlocks.push(`<ol class="list-decimal pl-5 my-2 space-y-1">${items.join("")}</ol>`);
      continue;
    }

    // 9. Raw HTML block line (e.g., <div..., <table..., <ul..., <p...)
    if (/^<(?:div|table|ul|ol|p|h[1-6]|blockquote)\b/i.test(trimmed)) {
      htmlBlocks.push(formatInlineMarkdown(trimmed));
      i++;
      continue;
    }

    // 10. Standard Paragraph (collect consecutive non-special lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(?:#{1,4}\s|[-*+]\s|\d+\.\s|>\s|(?:-{3,}|\*{3,}|_{3,})$|@@CODE_BLOCK_\d+@@$)/.test(
        lines[i].trim()
      ) &&
      !(
        lines[i].trim().startsWith("|") &&
        i + 1 < lines.length &&
        /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(lines[i + 1])
      )
    ) {
      paraLines.push(formatInlineMarkdown(lines[i].trim()));
      i++;
    }

    if (paraLines.length > 0) {
      htmlBlocks.push(`<p class="leading-relaxed">${paraLines.join("<br />")}</p>`);
    }
  }

  return htmlBlocks.join("\n");
}

