/**
 * render.ts — terminal colour & layout primitives
 * Zero dependencies — raw ANSI only so the binary stays tiny.
 */

export const c = {
  reset:    "\x1b[0m",
  bold:     "\x1b[1m",
  dim:      "\x1b[2m",

  black:    "\x1b[30m",
  red:      "\x1b[31m",
  green:    "\x1b[32m",
  yellow:   "\x1b[33m",
  blue:     "\x1b[34m",
  magenta:  "\x1b[35m",
  cyan:     "\x1b[36m",
  white:    "\x1b[37m",

  bgBlack:  "\x1b[40m",
  bgRed:    "\x1b[41m",

  orange:   "\x1b[38;5;208m",
  amber:    "\x1b[38;5;214m",
  gold:     "\x1b[38;5;220m",
  lime:     "\x1b[38;5;154m",
  teal:     "\x1b[38;5;80m",
  muted:    "\x1b[38;5;244m",
  muted2:   "\x1b[38;5;239m",
  pink:     "\x1b[38;5;213m",
};

/** Strip ANSI codes to measure true display width */
export function visibleLen(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

/** Pad string to visible width, ignoring ANSI */
export function pad(s: string, width: number, align: "left"|"right" = "left"): string {
  const diff = width - visibleLen(s);
  if (diff <= 0) return s;
  return align === "left" ? s + " ".repeat(diff) : " ".repeat(diff) + s;
}

/** Format numbers */
export const fmt = {
  tok:  (n: number) => n >= 1e6 ? `${(n/1e6).toFixed(2)}M` : n >= 1e3 ? `${(n/1e3).toFixed(0)}K` : String(n),
  usd:  (n: number) => `$${n.toFixed(4)}`,
  usd2: (n: number) => `$${n.toFixed(2)}`,
  pct:  (n: number) => `${n.toFixed(1)}%`,
  num:  (n: number) => n.toLocaleString(),
};

const COLS = process.stdout.columns || 88;

/** Horizontal rule */
export function hr(char = "─", color = c.muted2): string {
  return color + char.repeat(COLS) + c.reset;
}

/** Section header */
export function header(title: string, sub = ""): string {
  const left  = `${c.bold}${c.orange} ${title}${c.reset}`;
  const right = sub ? `${c.muted} ${sub}${c.reset}` : "";
  const gap   = COLS - visibleLen(` ${title}`) - visibleLen(` ${sub}`) - 2;
  return left + (gap > 0 ? " ".repeat(gap) : "  ") + right;
}

/** Horizontal bar chart row */
export function barRow(
  label: string,
  value: string,
  fraction: number,          // 0–1
  barWidth = 24,
  barColor = c.orange,
): string {
  const filled = Math.round(fraction * barWidth);
  const bar    = barColor + "█".repeat(filled) + c.muted2 + "░".repeat(barWidth - filled) + c.reset;
  return `  ${pad(label, 22)}${bar}  ${c.bold}${pad(value, 10, "right")}${c.reset}`;
}

/** Key-value row */
export function kv(key: string, value: string, valueColor = c.white): string {
  return `  ${c.muted}${pad(key, 22)}${c.reset}${valueColor}${value}${c.reset}`;
}

/** Table row */
export function tableRow(cols: { text: string; width: number; align?: "left"|"right"; color?: string }[]): string {
  return "  " + cols.map(col =>
    (col.color ?? "") + pad(col.text, col.width, col.align ?? "left") + c.reset
  ).join("  ");
}

/** Severity badge */
export function sevBadge(sev: string): string {
  const map: Record<string, string> = {
    critical: `${c.red}${c.bold}● CRIT ${c.reset}`,
    high:     `${c.orange}${c.bold}● HIGH ${c.reset}`,
    medium:   `${c.gold}● MED  ${c.reset}`,
    low:      `${c.blue}● LOW  ${c.reset}`,
  };
  return map[sev] ?? sev;
}

/** Saving badge (green) */
export function savingBadge(usd: number): string {
  return `${c.lime}${c.bold}saves ${fmt.usd2(usd)}/mo${c.reset}`;
}

/** Print blank line */
export const nl = () => console.log();
