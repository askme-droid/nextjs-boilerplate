// Turns the lines of text a flyer's OCR found into suggestions for a listing's
// fields. Pure functions (no browser APIs), so they are easy to test.
//
// This is deliberately *rules*, not understanding: it finds things that have a
// recognisable shape (dates, phone numbers, addresses, the biggest lettering)
// and offers hints for the rest. Everything it returns is a suggestion for a
// person to review — see FlyerReader.

export type ReaderLine = {
  text: string;
  /** 0-100 */
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

export type CorpusItem = { categoryId: string; text: string };
export type CategoryHint = { categoryId: string; score: number };

export type FlyerReading = {
  /** Cleaned text lines, top to bottom. */
  lines: string[];
  title: string;
  /** The flyer's wording tidied into sentences, to edit into a description. */
  description: string;
  keywords: string[];
  /** The most likely end date (ISO), when the flyer states one. */
  expiry: { iso: string; raw: string } | null;
  /** Every date found, as printed. */
  dates: string[];
  phones: string[];
  location: string;
  categories: CategoryHint[];
};

// ---------------------------------------------------------------------------
// Putting spaces back. PaddleOCR's reader often runs words together
// ("FRESHLYMADEDOUGH"); a word list lets us split long runs back apart.
// The word list is in frequency order, so common words win ties
// ("curtains and blinds", not "curtain sand blinds").

const MAX_WORD = 18;
const MIN_RUN = 8; // shorter runs are left alone: they are usually a real word or a brand
const COMMON_SHORT = 5000; // words of 3 letters or fewer must rank within this many

export function createSegmenter(wordList: string) {
  const rank = new Map<string, number>();
  wordList
    .split("\n")
    .map((w) => w.trim())
    .filter(Boolean)
    .forEach((w, i) => rank.set(w, i));
  const size = rank.size || 1;

  const knownCost = (word: string, index: number) => {
    const base = word.length >= 4 ? 1 : word.length === 3 ? 1.6 : word.length === 2 ? 2.4 : 3;
    return base + (0.5 * Math.log(index + 2)) / Math.log(size + 2);
  };
  // A stretch the list doesn't know (a brand, an OCR slip) costs more than a
  // known word, so it is only used when nothing known fits.
  const unknownCost = (length: number) => 2.4 + 0.9 * length;

  /** Splits one run of letters into words, or null if that can't be done well. */
  function splitRun(run: string): string[] | null {
    const lower = run.toLowerCase();
    const n = lower.length;
    const best = new Array<number>(n + 1).fill(Infinity);
    const from = new Array<number>(n + 1).fill(-1);
    const unknown = new Array<boolean>(n + 1).fill(false);
    best[0] = 0;
    for (let i = 1; i <= n; i++) {
      for (let j = Math.max(0, i - MAX_WORD); j < i; j++) {
        if (best[j] === Infinity) continue;
        const piece = lower.slice(j, i);
        const index = rank.get(piece);
        // Short words must be common ones: rare 3-letter entries ("rat",
        // "ion", "est") are what cause splits like "filt rat ion".
        if (index !== undefined && (piece.length > 3 || index < COMMON_SHORT)) {
          const cost = best[j] + knownCost(piece, index);
          if (cost < best[i]) {
            best[i] = cost;
            from[i] = j;
            unknown[i] = false;
          }
        } else if (i - j <= 4 && !unknown[j]) {
          const cost = best[j] + unknownCost(i - j);
          if (cost < best[i]) {
            best[i] = cost;
            from[i] = j;
            unknown[i] = true;
          }
        }
      }
    }
    if (best[n] === Infinity) return null;

    const parts: { text: string; unknown: boolean }[] = [];
    for (let i = n; i > 0; i = from[i]) parts.unshift({ text: run.slice(from[i], i), unknown: unknown[i] });

    const unknownLetters = parts.filter((p) => p.unknown).reduce((sum, p) => sum + p.text.length, 0);
    if (unknownLetters > n * 0.3) return null;

    // A short unknown piece is most likely the ending of the word before it
    // (fresh+ly) or the start of the one after.
    const merged: { text: string; unknown: boolean }[] = [];
    for (const part of parts) {
      const last = merged[merged.length - 1];
      if (part.unknown && last && !last.unknown && part.text.length <= 3) last.text += part.text;
      else merged.push({ ...part });
    }
    const final: string[] = [];
    for (let k = 0; k < merged.length; k++) {
      const part = merged[k];
      if (part.unknown && part.text.length <= 3 && merged[k + 1] && !merged[k + 1].unknown) {
        merged[k + 1].text = part.text + merged[k + 1].text;
      } else final.push(part.text);
    }
    // Reject splits into lots of tiny words: that is usually a wrong guess.
    if (run.length / final.length < 2.6) return null;
    return final;
  }

  return function segment(text: string): string {
    return text
      .replace(/([a-z]{3,})([A-Z][a-z])/g, "$1 $2")
      .replace(/(\d)([A-Za-z]{4,})/g, "$1 $2")
      .replace(/([A-Za-z]{4,})(\d)/g, "$1 $2")
      .replace(/([A-Za-z])\$/g, "$1 $")
      .replace(new RegExp("[A-Za-z]{" + MIN_RUN + ",}", "g"), (run) => splitRun(run)?.join(" ") ?? run)
      .replace(/\s+/g, " ")
      .trim();
  };
}

// ---------------------------------------------------------------------------
// Small helpers

const STOP = new Set(
  "a an the and or of to in on at for with from by is are be this that it as your you we our us all any more can will get just now new only up out one two per not no yes terms conditions apply valid also has have been their they them its was were who what when where which than then into over about after before while such via off free".split(
    " ",
  ),
);

const letters = (s: string) => s.match(/[A-Za-z]/g) ?? [];
const isShouting = (s: string) => {
  const l = letters(s);
  return l.length >= 4 && l.filter((c) => c === c.toUpperCase()).length / l.length > 0.85;
};
const PROPER = /\b(jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec|singapore|english|chinese|malay|tamil|mon|tue|wed|thu|fri|sat|sun|january|february|march|april|june|july|august|september|october|november|december)\b/g;
const sentenceCase = (s: string) => {
  const lower = s.toLowerCase().replace(PROPER, (w) => w.charAt(0).toUpperCase() + w.slice(1));
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};
const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

// ---------------------------------------------------------------------------
// Dates

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const CUE = /(till|until|valid|ends?|by|expires?|before|through|thru|to)\W{0,3}$/i;

type FoundDate = { raw: string; iso: string | null; cued: boolean };

export function findDates(text: string): FoundDate[] {
  const found: FoundDate[] = [];
  const named =
    /(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?,?\s*(20\d{2})?/gi;
  let m: RegExpExecArray | null;
  while ((m = named.exec(text))) {
    const day = Number(m[1]);
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    const year = m[3] ? Number(m[3]) : null;
    const valid = day >= 1 && day <= 31 && month;
    found.push({
      raw: m[0].trim(),
      iso: valid && year ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null,
      cued: CUE.test(text.slice(Math.max(0, m.index - 24), m.index)),
    });
  }
  // 31/12/2025, 31.12.2025 (day first, as is usual in Singapore)
  const numeric = /(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](20\d{2})(?!\d)/g;
  while ((m = numeric.exec(text))) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (day < 1 || day > 31 || month < 1 || month > 12) continue;
    found.push({
      raw: m[0],
      iso: `${m[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      cued: CUE.test(text.slice(Math.max(0, m.index - 24), m.index)),
    });
  }
  return found;
}

function pickExpiry(dates: FoundDate[]): { iso: string; raw: string } | null {
  const usable = dates.filter((d) => d.iso);
  const cued = usable.filter((d) => d.cued);
  const chosen = cued.length ? cued[cued.length - 1] : usable.length === 1 ? usable[0] : null;
  return chosen?.iso ? { iso: chosen.iso, raw: chosen.raw } : null;
}

// ---------------------------------------------------------------------------
// Phone numbers and addresses

export function findPhones(text: string): string[] {
  const out = new Set<string>();
  const re = /(?<!\d)(?:\+?65[\s-]?)?([3689]\d{3})[\s-]?(\d{4})(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.add(`${m[1]} ${m[2]}`);
  return [...out].slice(0, 3);
}

const STREET =
  /\b(Road|Rd|Ave|Avenue|Street|St|Drive|Dr|Lane|Crescent|Boulevard|Blvd|Walk|Way|Close|Place|Central|Block|Blk)\b/i;

export function findLocation(lines: string[]): string {
  const matching = lines.filter(
    (l) => /(?<!\d)\d{6}(?!\d)/.test(l) || /#\d{1,3}-\d{1,4}/.test(l) || (STREET.test(l) && /\d/.test(l)),
  );
  return matching.slice(0, 2).join(", ");
}

// ---------------------------------------------------------------------------
// Category hints: how similar the flyer's words are to the existing listings
// of each category (TF-IDF, centroid per category).

const words = (s: string) =>
  (s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((t) => !STOP.has(t) && !/^\d+$/.test(t));

export function suggestCategories(text: string, corpus: CorpusItem[], count = 3): CategoryHint[] {
  if (!corpus.length) return [];
  const docs = corpus.map((c) => ({ categoryId: c.categoryId, tokens: words(c.text) }));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d.tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t: string) => Math.log((docs.length + 1) / ((df.get(t) ?? 0) + 1)) + 1;

  const vector = (tokens: string[]) => {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    const v = new Map<string, number>();
    let norm = 0;
    for (const [t, c] of tf) {
      if (!df.has(t)) continue;
      const w = (1 + Math.log(c)) * idf(t);
      v.set(t, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of v) v.set(t, w / norm);
    return v;
  };

  const centroids = new Map<string, Map<string, number>>();
  for (const d of docs) {
    const sums = centroids.get(d.categoryId) ?? new Map<string, number>();
    for (const [t, w] of vector(d.tokens)) sums.set(t, (sums.get(t) ?? 0) + w);
    centroids.set(d.categoryId, sums);
  }

  const query = vector(words(text));
  const scored: CategoryHint[] = [];
  for (const [categoryId, sums] of centroids) {
    let norm = 0;
    for (const w of sums.values()) norm += w * w;
    norm = Math.sqrt(norm) || 1;
    let score = 0;
    for (const [t, w] of query) {
      const o = sums.get(t);
      if (o) score += w * (o / norm);
    }
    if (score > 0) scored.push({ categoryId, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, count);
}

// ---------------------------------------------------------------------------
// The whole reading

export function analyse(
  rawLines: ReaderLine[],
  options: { segment: (text: string) => string; corpus: CorpusItem[] },
): FlyerReading {
  const cleaned = rawLines
    .map((l) => ({ ...l, text: options.segment(l.text.replace(/[|｜·•●▪]/g, " ")) }))
    .filter((l) => l.confidence >= 50 && letters(l.text).length + (l.text.match(/\d/g) ?? []).length >= 3)
    .sort((a, b) => a.bbox.y0 - b.bbox.y0);

  const height = (l: ReaderLine) => l.bbox.y1 - l.bbox.y0;

  // Title: the biggest lettering, plus a neighbouring line of similar size.
  let title = "";
  const wordy = cleaned.filter((l) => letters(l.text).length >= 3);
  if (wordy.length) {
    const top = [...wordy].sort((a, b) => height(b) - height(a))[0];
    const near = wordy.filter(
      (l) => l !== top && Math.abs(height(l) - height(top)) <= height(top) * 0.35 && Math.abs(l.bbox.y0 - top.bbox.y0) < height(top) * 2.6,
    );
    const raw = [top, ...near.slice(0, 1)]
      .sort((a, b) => a.bbox.y0 - b.bbox.y0)
      .map((l) => l.text)
      .join(" ");
    title = isShouting(raw) ? titleCase(raw) : raw;
  }

  const lines = cleaned.map((l) => l.text);
  const allText = lines.join(" ");
  const dates = findDates(allText);

  // Description: the flyer's wording as short sentences, minus the title.
  const sentences: string[] = [];
  let length = 0;
  for (const l of cleaned) {
    const t = l.text.trim();
    if (t.split(/\s+/).length < 3 || l.confidence < 60 || t.toLowerCase() === title.toLowerCase()) continue;
    const s = (isShouting(t) ? sentenceCase(t) : t.charAt(0).toUpperCase() + t.slice(1)).replace(/[\s.,;:]+$/, "") + ".";
    if (length + s.length > 600) break;
    sentences.push(s);
    length += s.length + 1;
  }

  // Keywords: frequent real words (or words that are in the title).
  const counts = new Map<string, number>();
  const titleWords = new Set(words(title));
  for (const t of [...words(title), ...words(title), ...words(allText)]) counts.set(t, (counts.get(t) ?? 0) + 1);
  const keywords = [...counts.entries()]
    .filter(([t, c]) => c >= 2 || titleWords.has(t) || t.length >= 5)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 8)
    .map(([t]) => t);

  return {
    lines,
    title,
    description: sentences.join(" "),
    keywords,
    expiry: pickExpiry(dates),
    dates: dates.map((d) => d.raw),
    phones: findPhones(allText),
    location: findLocation(lines),
    categories: suggestCategories(allText, options.corpus),
  };
}
