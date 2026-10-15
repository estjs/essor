// Get text from JSX text node, preserving necessary whitespace
export function getJSXText(value: string): string {
  if (!value) return '';

  const lines = value.split(/\r\n|\n|\r/);
  let lastNonEmptyLine = 0;

  // Find last line with non-whitespace content
  for (const [i, line] of lines.entries()) {
    if (/[^ \t]/.test(line)) {
      lastNonEmptyLine = i;
    }
  }

  let str = '';
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replaceAll('\t', ' ');

    // Remove leading spaces from continuation lines
    if (i !== 0) {
      line = line.replace(/^ +/, '');
    }

    // Remove trailing spaces from all but last line
    if (i !== lines.length - 1) {
      line = line.replace(/ +$/, '');
    }

    if (line) {
      // Add space after non-empty lines (except the last one with content)
      if (i !== lastNonEmptyLine) {
        line += ' ';
      }
      str += line;
    }
  }

  return str;
}
