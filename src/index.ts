/**
 * token-estimator
 *
 * Heuristic token count ESTIMATION for LLM prompts, without loading any
 * real tokenizer. This is deliberately approximate — see the "Limits"
 * section of the README. Do not use this for billing-critical accuracy;
 * use the provider's real tokenizer (e.g. `tiktoken`, Anthropic's token
 * counting endpoint) when you need exact numbers.
 */

export type ModelFamily = "claude" | "gpt" | "generic";

export interface EstimateOptions {
  /** Which calibration curve to apply. Defaults to "generic". */
  model?: ModelFamily;
  /** Treat the text as source code (denser tokenization). Auto-detected if omitted. */
  isCode?: boolean;
}

export interface TokenEstimate {
  /** Estimated token count (integer, rounded). */
  tokens: number;
  /** Estimation method's stated error band, e.g. 0.15 for +/-15%. */
  errorMargin: number;
  /** Low/high bounds derived from tokens * (1 -/+ errorMargin). */
  low: number;
  high: number;
}

/**
 * Per-model calibration factors applied to the char-based baseline.
 * These are ESTIMATES derived from informal sampling, not vendor specs.
 * Vendors change tokenizers over time — treat these as directional only.
 */
const MODEL_CALIBRATION: Record<ModelFamily, number> = {
  claude: 1.05,
  gpt: 1.0,
  generic: 1.0,
};

/** Declared error margin for all estimates produced by this library. */
export const ERROR_MARGIN = 0.15;

const CJK_RANGE = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/;

function cjkRatio(text: string): number {
  if (text.length === 0) return 0;
  let count = 0;
  for (const ch of text) {
    if (CJK_RANGE.test(ch)) count++;
  }
  return count / text.length;
}

function looksLikeCode(text: string): boolean {
  const sample = text.slice(0, 2000);
  if (sample.length === 0) return false;
  const codeSignals =
    (sample.match(/[{}();=<>\[\]]/g) || []).length +
    (sample.match(/^\s*(function|const|let|var|import|export|class|def|return)\b/gm) || [])
      .length *
      3;
  const density = codeSignals / sample.length;
  return density > 0.06;
}

function charBaseline(text: string): number {
  if (text.length === 0) return 0;

  const charsOver4 = text.length / 4;

  const words = text.split(/\s+/).filter(Boolean);
  const avgWordLen = words.length > 0 ? text.length / words.length : 4;
  let wordBasedEstimate = words.length * 0.75;
  if (avgWordLen > 7) {
    wordBasedEstimate *= 1 + (avgWordLen - 7) * 0.06;
  }

  const whitespaceRuns = (text.match(/\s{2,}/g) || []).length;
  const whitespacePenalty = whitespaceRuns * 0.5;

  const blended = charsOver4 * 0.5 + wordBasedEstimate * 0.5 - whitespacePenalty;
  return Math.max(blended, text.length > 0 ? 1 : 0);
}

/**
 * Estimate the token count of a single string.
 *
 * This is a heuristic estimate, not an exact count. See README "Limits".
 */
export function estimateTokens(text: string, options: EstimateOptions = {}): TokenEstimate {
  if (typeof text !== "string") {
    throw new TypeError("estimateTokens: text must be a string");
  }
  if (text.length === 0) {
    return { tokens: 0, errorMargin: ERROR_MARGIN, low: 0, high: 0 };
  }

  const family = options.model ?? "generic";
  const isCode = options.isCode ?? looksLikeCode(text);
  const cjk = cjkRatio(text);

  let tokens: number;

  if (cjk > 0.3) {
    const cjkChars = Math.round(text.length * cjk);
    tokens = cjkChars + charBaseline(text) * (1 - cjk);
  } else {
    tokens = charBaseline(text);
  }

  if (isCode) {
    tokens *= 1.25;
  }

  tokens *= MODEL_CALIBRATION[family];

  const rounded = Math.max(1, Math.round(tokens));
  return {
    tokens: rounded,
    errorMargin: ERROR_MARGIN,
    low: Math.floor(rounded * (1 - ERROR_MARGIN)),
    high: Math.ceil(rounded * (1 + ERROR_MARGIN)),
  };
}

export interface ChatMessage {
  role: string;
  content: string;
}

/**
 * Per-message wrapper overhead (role field, message delimiters, etc.)
 * charged on top of content tokens when estimating a message array.
 * This is a rough constant, not derived from any vendor spec.
 */
export const MESSAGE_OVERHEAD_TOKENS = 4;

/**
 * Estimate the total token count of a chat message array, including a
 * flat per-message overhead for role/delimiter wrapping.
 */
export function estimateMessages(
  messages: ChatMessage[],
  options: EstimateOptions = {}
): TokenEstimate {
  if (!Array.isArray(messages)) {
    throw new TypeError("estimateMessages: messages must be an array");
  }

  let tokens = 0;
  for (const msg of messages) {
    tokens += estimateTokens(msg.content ?? "", options).tokens;
    tokens += MESSAGE_OVERHEAD_TOKENS;
  }

  const rounded = Math.round(tokens);
  return {
    tokens: rounded,
    errorMargin: ERROR_MARGIN,
    low: Math.floor(rounded * (1 - ERROR_MARGIN)),
    high: Math.ceil(rounded * (1 + ERROR_MARGIN)),
  };
}

export interface FitsWithinResult {
  fits: boolean;
  estimatedTokens: number;
  limit: number;
  reserve: number;
  available: number;
}

/**
 * Budget helper: does this message array fit within `limit` tokens,
 * after reserving `reserve` tokens (e.g. for the model's response)?
 */
export function fitsWithin(
  messages: ChatMessage[],
  limit: number,
  reserve = 0,
  options: EstimateOptions = {}
): FitsWithinResult {
  const estimate = estimateMessages(messages, options);
  const available = limit - reserve;
  return {
    fits: estimate.tokens <= available,
    estimatedTokens: estimate.tokens,
    limit,
    reserve,
    available,
  };
}
