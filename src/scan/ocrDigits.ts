const MIN_OCR_DIGITS = 3;

function mapOcrChar(ch: string): string {
  "worklet";
  if (ch >= "0" && ch <= "9") return ch;
  const upper = ch.toUpperCase();
  if (upper === "O" || upper === "D") return "0";
  if (upper === "I" || ch === "l" || ch === "|" || ch === "!") return "1";
  if (upper === "S") return "5";
  if (upper === "B") return "8";
  if (upper === "Z") return "2";
  if (upper === "G") return "6";
  return " ";
}

export function digitsFromOcrText(raw: string): string | null {
  "worklet";
  if (!raw) return null;
  let mapped = "";
  for (let i = 0; i < raw.length; i += 1) {
    mapped += mapOcrChar(raw.charAt(i));
  }
  let best: string | null = null;
  let current = "";
  for (let i = 0; i < mapped.length; i += 1) {
    const ch = mapped.charAt(i);
    if (ch >= "0" && ch <= "9") {
      current += ch;
      continue;
    }
    if (!best || current.length > best.length) best = current || best;
    current = "";
  }
  if (!best || current.length > best.length) best = current || best;
  if (!best || best.length < MIN_OCR_DIGITS) return null;
  return best;
}
