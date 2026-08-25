/**
 * Converts AI-generated markdown into rich semantic HTML for Tiptap editor insertion.
 * Handles headings, bold/italic, lists, blockquotes, tables, and streaming code blocks.
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';

  // 1. Normalize line breaks
  let text = markdown.replace(/\r\n/g, '\n');

  // 2. Protect and extract code blocks before line-by-line processing
  const codeBlocks: string[] = [];
  
  // Match both closed ```code``` and unclosed streaming ```code
  text = text.replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)(?:```|$)/g, (_match, lang, code) => {
    const language = lang.trim() || 'typescript';
    const escapedCode = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const placeholder = `§§DSCB${codeBlocks.length}§§`;
    codeBlocks.push(`<pre><code class="language-${language}">${escapedCode.trim()}</code></pre>`);
    return `\n\n${placeholder}\n\n`;
  });

  // 3. Inline code
  text = text.replace(/`([^`\n]+)`/g, (_m, code) => {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<code>${escaped}</code>`;
  });

  // 4. Headings
  text = text.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  text = text.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  text = text.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // 5. Bold & Italic (using standard markdown markers without colliding with placeholders)
  text = text.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  text = text.replace(/___(.*?)___/g, '<strong><em>$1</em></strong>');
  text = text.replace(/__(.*?)__/g, '<strong>$1</strong>');
  text = text.replace(/_([^\s_].*?[^\s_])_/g, '<em>$1</em>');

  // 6. Blockquotes
  text = text.replace(/^\> (.*$)/gim, '<blockquote><p>$1</p></blockquote>');

  // 7. Process lines for lists, tables, and paragraphs
  const rawLines = text.split('\n');
  const output: string[] = [];
  let inUl = false;
  let inOl = false;
  let inTable = false;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();

    // Check for code block placeholder
    if (line.startsWith('§§DSCB') && line.endsWith('§§')) {
      if (inUl) { output.push('</ul>'); inUl = false; }
      if (inOl) { output.push('</ol>'); inOl = false; }
      if (inTable) { output.push('</tbody></table>'); inTable = false; }
      output.push(line);
      continue;
    }

    if (!line) {
      if (inUl) { output.push('</ul>'); inUl = false; }
      if (inOl) { output.push('</ol>'); inOl = false; }
      if (inTable) { output.push('</tbody></table>'); inTable = false; }
      continue;
    }

    // Unordered List
    if (/^[\*\-\+] (.*)/.test(line)) {
      if (inOl) { output.push('</ol>'); inOl = false; }
      if (inTable) { output.push('</tbody></table>'); inTable = false; }
      if (!inUl) { output.push('<ul>'); inUl = true; }
      output.push(line.replace(/^[\*\-\+] (.*)/, '<li>$1</li>'));
      continue;
    }

    // Ordered List
    if (/^\d+\. (.*)/.test(line)) {
      if (inUl) { output.push('</ul>'); inUl = false; }
      if (inTable) { output.push('</tbody></table>'); inTable = false; }
      if (!inOl) { output.push('<ol>'); inOl = true; }
      output.push(line.replace(/^\d+\. (.*)/, '<li>$1</li>'));
      continue;
    }

    // Markdown Table Rows (e.g. | col1 | col2 |)
    if (line.startsWith('|') && line.endsWith('|')) {
      if (inUl) { output.push('</ul>'); inUl = false; }
      if (inOl) { output.push('</ol>'); inOl = false; }

      // Skip separator rows (|---|---|)
      if (/^\|[\s\-:|]+\|$/.test(line)) {
        continue;
      }

      const cells = line.slice(1, -1).split('|').map(c => c.trim());
      if (!inTable) {
        output.push('<table class="border-collapse border border-white/20 my-2 w-full text-xs"><thead><tr>');
        cells.forEach(c => output.push(`<th class="border border-white/20 p-1.5 bg-white/5 font-bold">${c}</th>`));
        output.push('</tr></thead><tbody>');
        inTable = true;
      } else {
        output.push('<tr>');
        cells.forEach(c => output.push(`<td class="border border-white/20 p-1.5">${c}</td>`));
        output.push('</tr>');
      }
      continue;
    }

    // Normal text / HTML element
    if (inUl) { output.push('</ul>'); inUl = false; }
    if (inOl) { output.push('</ol>'); inOl = false; }
    if (inTable) { output.push('</tbody></table>'); inTable = false; }

    if (line.startsWith('<h') || line.startsWith('<blockquote') || line.startsWith('</')) {
      output.push(line);
    } else {
      output.push(`<p>${line}</p>`);
    }
  }

  if (inUl) output.push('</ul>');
  if (inOl) output.push('</ol>');
  if (inTable) output.push('</tbody></table>');

  // 8. Re-insert code blocks safely
  let result = output.join('\n');
  codeBlocks.forEach((block, index) => {
    result = result.replace(`§§DSCB${index}§§`, block);
  });

  return result;
}
