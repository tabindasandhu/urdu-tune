// Word Error Rate helpers, used to score the model's draft against the human's correction.

const DIACRITICS = /[\u064B-\u0652\u0670]/g; // zabar, zer, pesh, etc.
const PUNCTUATION = /[۔،؟!?.,:;"'()]/g;

export function words(text: string): string[] {
  return text
    .normalize("NFC")
    .replace(DIACRITICS, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(PUNCTUATION, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Minimum number of word substitutions + deletions + insertions to turn `hyp` into `ref`.
export function wordEdits(ref: string[], hyp: string[]): number {
  let prev = Array.from({ length: hyp.length + 1 }, (_, j) => j);
  for (let i = 1; i <= ref.length; i++) {
    const cur = [i];
    for (let j = 1; j <= hyp.length; j++) {
      const sub = prev[j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1);
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, sub);
    }
    prev = cur;
  }
  return prev[hyp.length];
}

// Corpus WER: total edits / total reference words (not an average of per-clip WERs).
export function draftWer(clips: { draft_text: string; text: string }[]): number | null {
  let edits = 0;
  let total = 0;
  for (const c of clips) {
    const ref = words(c.text);
    edits += wordEdits(ref, words(c.draft_text));
    total += ref.length;
  }
  return total ? edits / total : null;
}