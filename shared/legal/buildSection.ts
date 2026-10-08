import type { LegalSection } from "./types";

export function section(id: string, title: string, paragraphs: string[]): LegalSection {
  return { id, title, content: paragraphs.join("\n\n") };
}
