// Zero-dependency smoke test (plain Node "assert"), run with:
//   node test/run-samples.js
//
// It does NOT check the exact JSON shape produced for each sample (there is
// no single "correct" tree for malformed HTML) - it checks the one thing the
// task explicitly requires: html2json must never throw and must always
// return a JSON-serializable value, for every sample file plus a handful of
// intentionally nasty inline edge cases.

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { html2json } = require("../html2json.js");

const samplesDir = path.join(__dirname, "..", "html_samples");
let passed = 0;
let failed = 0;

function runCase(label, input) {
  try {
    const result = html2json(input);
    assert.strictEqual(typeof result, "object");
    assert.ok(result !== null);
    // Must be JSON-serializable (throws on cycles/BigInt/etc).
    JSON.stringify(result);
    console.log(`PASS  ${label}`);
    passed++;
  } catch (error) {
    console.log(`FAIL  ${label}: ${error.message}`);
    failed++;
  }
}

// 1. All files under html_samples/.
for (const fileName of fs.readdirSync(samplesDir)) {
  const filePath = path.join(samplesDir, fileName);
  const content = fs.readFileSync(filePath, "utf8");
  runCase(fileName, content);
}

// 2. Inline edge cases that are awkward to keep as files.
const inlineCases = {
  "empty string": "",
  "whitespace only": "   \n\t  ",
  "plain text, no tags": "just some plain text, no markup at all",
  "null input": null,
  "undefined input": undefined,
  "number input": 12345,
  "only a lone '<'": "<",
  "only a lone '>'": ">",
  "deeply nested (2000 levels)": "<div>".repeat(2000) + "x" + "</div>".repeat(2000),
  "huge flat text (500k chars)": "a".repeat(500000),
  "unclosed script": "<script>var x = 1;",
  "attribute value never closed": '<div title="unterminated>text after',
  "self-closing non-void element": "<div/>after",
  "mismatched nesting": "<b><i>x</b></i>",
};

for (const [label, input] of Object.entries(inlineCases)) {
  runCase(label, input);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
