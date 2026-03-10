export class Doc {
  text: string;

  constructor(text = "") {
    this.text = text;
  }

  read(): { text: string } {
    return { text: this.text };
  }

  apply(start: number, end: number, insert: string): number {
    start = Math.max(0, Math.min(start, this.text.length));
    end = Math.max(start, Math.min(end, this.text.length));
    this.text = this.text.slice(0, start) + insert + this.text.slice(end);
    return start + insert.length;
  }
}
