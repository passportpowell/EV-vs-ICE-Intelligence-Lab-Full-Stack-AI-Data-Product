import type { PortfolioDataset, RagDocument, RagHit } from "@/lib/types";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "best",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "vs",
  "what",
  "which",
  "with"
]);

export function retrieveDocuments(
  data: PortfolioDataset,
  query: string,
  limit = 5
): RagHit[] {
  const terms = tokenize(query);
  if (terms.length === 0) {
    return [];
  }

  return data.rag_corpus
    .map((document) => scoreDocument(document, terms))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function buildRagAnswer(query: string, hits: RagHit[]): string {
  if (hits.length === 0) {
    return "I could not find a grounded match in the project knowledge base.";
  }

  const top = hits[0];
  const support = hits
    .slice(1, 3)
    .map((hit) => hit.title)
    .join(", ");
  const supportText = support ? ` Supporting context: ${support}.` : "";

  return `For "${query}", the strongest retrieved source is "${top.title}". ${top.content}${supportText}`;
}

function scoreDocument(document: RagDocument, terms: string[]): RagHit {
  const titleTokens = tokenize(document.title);
  const tagTokens = document.tags.flatMap(tokenize);
  const contentTokens = tokenize(document.content);
  const allTokens = [...titleTokens, ...tagTokens, ...contentTokens];
  const matchedTerms = Array.from(new Set(terms.filter((term) => allTokens.includes(term))));

  let score = 0;
  for (const term of terms) {
    score += titleTokens.filter((token) => token === term).length * 4;
    score += tagTokens.filter((token) => token === term).length * 3;
    score += contentTokens.filter((token) => token === term).length;
  }

  const normalizedScore = score / Math.sqrt(Math.max(allTokens.length, 1));

  return {
    ...document,
    score: Number(normalizedScore.toFixed(3)),
    matched_terms: matchedTerms
  };
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((term) => normalizeTerm(term.trim()))
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term));
}

function normalizeTerm(term: string): string {
  const synonyms: Record<string, string> = {
    carbon: "co2e",
    charging: "charge",
    cheapest: "cost",
    cheap: "cost",
    cleaner: "emissions",
    cleanest: "emissions",
    diesel: "diesel",
    electric: "ev",
    electricity: "ev",
    emission: "emissions",
    emissions: "emissions",
    ice: "petrol",
    mileage: "miles",
    ml: "model",
    rag: "rag"
  };

  return synonyms[term] ?? term;
}
