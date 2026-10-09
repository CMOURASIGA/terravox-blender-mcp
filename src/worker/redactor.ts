export class Redactor {
  private readonly rules: readonly [string, string][];

  constructor(rules: readonly [string, string][]) {
    this.rules = [...rules].filter(([from]) => from.length > 1).sort((a, b) => b[0].length - a[0].length);
  }

  apply(text: string): string {
    let out = text;
    for (const [from, to] of this.rules) out = out.split(from).join(to);
    return out;
  }

  tail(text: string, maxChars: number): string {
    const redacted = this.apply(text);
    return redacted.length > maxChars ? `…${redacted.slice(-maxChars)}` : redacted;
  }
}
