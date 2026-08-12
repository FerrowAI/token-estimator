const { estimateTokens, estimateMessages, fitsWithin } = require("../dist/index.js");

const prose = "The quick brown fox jumps over the lazy dog. This is a plain English sentence.";
const code = "function add(a, b) {\n  return a + b;\n}\nconst x = add(1, 2);";
const cjk = "こんにちは世界、これはテストです。";

console.log("prose:", estimateTokens(prose));
console.log("code:", estimateTokens(code));
console.log("cjk:", estimateTokens(cjk));

const messages = [
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: prose },
  { role: "assistant", content: code },
];
console.log("messages:", estimateMessages(messages, { model: "claude" }));
console.log("fitsWithin(8000, reserve=1000):", fitsWithin(messages, 8000, 1000));
console.log("fitsWithin(50, reserve=0):", fitsWithin(messages, 50, 0));
