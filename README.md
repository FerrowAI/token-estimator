# token-estimator

Heuristic token count **estimation** for LLM prompts — no tokenizer
dependency, zero runtime deps, strict TypeScript.

This blends a chars/4 baseline with word-boundary, whitespace-run, CJK, and
code-density signals, then applies a per-model calibration factor. It ships
with an explicit **+/-15% error margin**. Use it for quick budget checks
(does this prompt fit in my context window?) — **not** for billing-critical
accuracy. For that, use the provider's real tokenizer (e.g. `tiktoken` for
OpenAI, Anthropic's token-counting endpoint for Claude).

## Quickstart

```ts
import { estimateTokens, estimateMessages, fitsWithin } from "token-estimator";

estimateTokens("The quick brown fox jumps over the lazy dog.");
// => { tokens: 11, errorMargin: 0.15, low: 9, high: 13 }

const messages = [
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "Explain quantum computing." },
];

estimateMessages(messages, { model: "claude" });
// => { tokens: ..., errorMargin: 0.15, low: ..., high: ... }

fitsWithin(messages, 8000, 1000);
// => { fits: true, estimatedTokens: ..., limit: 8000, reserve: 1000, available: 7000 }
```

## API

### `estimateTokens(text, options?)`

Estimates the token count of a single string.

- `text: string`
- `options.model?: "claude" | "gpt" | "generic"` — calibration curve, default `"generic"`.
- `options.isCode?: boolean` — force code-density mode; auto-detected if omitted.
- Returns `{ tokens, errorMargin, low, high }`.

### `estimateMessages(messages, options?)`

Estimates a chat message array, adding `MESSAGE_OVERHEAD_TOKENS` (4) per
message for role/delimiter wrapping.

- `messages: { role: string; content: string }[]`
- Returns the same `TokenEstimate` shape.

### `fitsWithin(messages, limit, reserve?, options?)`

Budget helper: does this message array fit within `limit` tokens after
reserving `reserve` tokens (e.g. for the model's response)?

- Returns `{ fits, estimatedTokens, limit, reserve, available }`.

### Constants

- `ERROR_MARGIN` — `0.15`
- `MESSAGE_OVERHEAD_TOKENS` — `4`

### Types

`ModelFamily`, `EstimateOptions`, `TokenEstimate`, `ChatMessage`, `FitsWithinResult`.

## Limits

- **Estimates only, +/-15% stated margin.** Never use this for exact
  billing, quota enforcement, or hard context-limit truncation — use the
  provider's real tokenizer for anything billing-critical.
- Calibration factors (`claude`/`gpt`) are informal approximations, not
  vendor-published constants, and drift as vendors change tokenizers.
- CJK detection is range-based and does not distinguish scripts with
  meaningfully different tokenization behavior beyond the CJK/non-CJK split.
- Code detection is a density heuristic on the first 2000 characters; it can
  misclassify short snippets or unusual languages.

---
Part of the [ferrow-toolkit](https://github.com/FerrowAI/ferrow-toolkit) collection · Sponsored by [Ferrow](https://ferrow.ai)
