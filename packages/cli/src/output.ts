/**
 * Output formatting for the CLI.
 */

let jsonMode = false;

export function setJsonMode(enabled: boolean) {
  jsonMode = enabled;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

/** Print data — as JSON if --json flag, otherwise as formatted text. */
export function output(data: unknown, formatted?: string) {
  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(formatted ?? JSON.stringify(data, null, 2));
  }
}

/** Print a simple table to the terminal. */
export function printTable(headers: string[], rows: string[][]) {
  if (rows.length === 0) {
    console.log("No results.");
    return;
  }

  // Calculate column widths
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] ?? "").length))
  );

  const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));
  const sep = widths.map(w => "─".repeat(w)).join("──");

  console.log(widths.map((w, i) => pad(headers[i], w)).join("  "));
  console.log(sep);
  for (const row of rows) {
    console.log(widths.map((w, i) => pad(row[i] ?? "", w)).join("  "));
  }
}

/** Print an error and exit. */
export function die(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

/** Truncate a string. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}
