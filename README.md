# Jito's Software Development Intern "html2json" Test Task

## Task Rationale
This task is designed to evaluate how well you solve problems without having every detail explicitly provided and to assess the quality of your deliverables. This type of task isn't necessarily reflective of your future work but aims to help us understand your thought process and reasoning in the context of software development.

## Assignment
Your task is to implement a function called `html2json`, which converts HTML data into a JSON representation.
AI tools usage is <b>REQUIRED</b>. Is is required that you provide your entire conversation history by attaching a link to the dialogue. Therefore, keep all your research within a single conversation and submit the link along with your task.

## Expected repository structure
- `html2json.js` - This file should contain your implementation of the html2json function.
- `html_samples/` folder - Include files with a text that you used as samples to test your function.
- `index.html` - The initial file we provided. You can leave it unchanged, but please include it in the archive.
- `ai_help/` folder - If you used any resources for code generation:
- Create a file named `chatgpt_chat.txt` with a link to the ChatGPT chat used.
- For any other AI resources, attach relevant `.pdf`, `.png`, or `.mp4` files showing how you used them.
- You can optionally update `README.md` completely if you want to add explanations of your reasoning or any other comments.

## Key Points for Evaluation
- Coverage of various HTML structures and different sizes.
- The code <b>MUST NOT</b> crash.
- Code cleanliness and formatting.
- Using a DOM parser is not allowed.
- How effectively you handled unexpected scenarios, such as situations where your code received valid HTML but still crashed or produced incorrect results. We will evaluate your ability to anticipate edge cases and ensure robustness in your solution.

## P.S. from the team
Please focus on quality rather than speed. Quality in this context means ensuring your solution is well thought-out, robust, and free of obvious issues. The speed of delivery will <b>NOT</b> be prioritized, so take the necessary time to research and refine your approach, as long as you complete the task within the specified timeframe.
Before submitting your final results, double or even triple-check everything:
- Verify that all links you provide are accessible in incognito mode, as broken links will result in your submission <b>NOT</b> being reviewed.
- Just before submitting, test your code again to ensure it still functions correctly and handles the html samples without crashing. If your code crashes or fails on your own samples, it will be treated as a failed submission.
- Make sure all items are included according to the [Expected Deliverables](#expected-deliverables) section. If any required files or information are missing, we will <b>NOT</b> be able to review your task, and it will be <ins>treated as failed</ins>.
- Jito’s senior developer will thoroughly review your solution. Based on this review, if deemed appropriate, you may be invited for a technical code review. This will include questions about the code, your understanding, and the reasoning behind your solution choices.
- The best indicator that you’ve done your best is the feeling of confidence when submitting, knowing that you have thoroughly checked your work and cannot think of anything more to improve.
- You can view test task template [here](https://jito-dev.github.io/jito-intern-test-task/)

## Solution notes

### How to run
No build step, no dependencies to install - just Node.js (for the tests) and a browser (for the UI).

- **Try it in the browser:** open `index.html` directly (double-click it, or run `open index.html` on macOS). Click "Input Example 1" / "Input Example 2" to load a sample, or paste your own HTML into the left textarea, then click "Convert to JSON" to see the result on the right.
- **Run the automated tests:** from the project root, run:
  ```
  node test/run-samples.js
  ```
  This runs `html2json` over every file in `html_samples/` plus a set of adversarial inline inputs (empty/null input, huge input, deeply nested tags, unterminated tags, etc.) and prints `PASS`/`FAIL` per case, ending with a summary (`22 passed, 0 failed`). Exit code is non-zero if anything fails.
- **Use it from Node directly:**
  ```js
  const { html2json } = require("./html2json.js");
  console.log(JSON.stringify(html2json("<div>Hello</div>"), null, 2));
  ```

### Approach
`html2json` is a small hand-written HTML tokenizer + tree builder (no `DOMParser`, no `innerHTML`, no third-party parsing libraries). It has two stages:
1. **Tokenizer** - scans the input character-by-character (using `indexOf`/manual index checks rather than heavy backtracking regexes) and emits tokens: start tags, end tags, text, comments, doctype.
2. **Tree builder** - consumes the tokens with a stack of currently-open elements to produce a nested tree.

### JSON shape
```
root:    { type: "root", children: [...] }
element: { type: "element", name: "div", attributes: { id: "x" }, children: [...] }
text:    { type: "text", value: "..." }
comment: { type: "comment", value: "..." }
doctype: { type: "doctype", value: "html" }
```
This mirrors the conventions used by well-known HTML parsers (e.g. `htmlparser2`/`hast`): every node has a `type` discriminator, tag nodes carry `name`/`attributes`/`children`, and leaf nodes carry a `value`. It's self-describing, trivial to walk recursively, and trivial to `JSON.stringify`/diff in tests. A `root` wrapper is used (instead of returning a bare array or requiring exactly one top-level element) so inputs with zero or multiple top-level nodes - like the "Input Example 2" fragment - are represented without a special case.

### Edge cases handled deliberately
- **Void elements** (`br`, `img`, `input`, `meta`, ...) never wait for a closing tag.
- **`<script>`/`<style>`** content is treated as raw text up to the matching close tag - `<`, `>`, quotes inside a script/CSS body are not mistaken for markup.
- **`<textarea>`/`<title>`** content is not parsed as markup, but HTML entities inside are still decoded.
- **Unclosed tags** at end of input are implicitly closed; a **stray/mismatched closing tag** (no matching opener on the stack) is ignored rather than corrupting the tree; a closing tag that matches an *ancestor* implicitly closes everything opened after it (e.g. `<b><i>x</b></i>` closes `<i>` along with `<b>`, and the trailing `</i>` is then a stray tag and ignored).
- **Unterminated comments/CDATA/attribute values/tags** consume to end-of-input instead of throwing or looping forever.
- Quoted (single/double), unquoted, and boolean attributes are all supported; both named (`&amp;`) and numeric (`&#169;`, `&#x1F600;`) character references are decoded, with unrecognized entities left untouched.
- The whole function is wrapped in `try/catch` and falls back to `{ type: "root", children: [], error: "..." }` on any unexpected failure, and the tokenizer guarantees forward progress on every iteration - so it cannot throw or hang, even on adversarial input (see `test/run-samples.js` for the specific cases exercised: `null`/`undefined`/non-string input, empty/whitespace-only input, 2000 levels of nesting, a 500k-character input, unterminated tags/comments/attributes, etc).

### Known limitations (out of scope for this task)
- No SVG/MathML "foreign content" namespace rules, no HTML5 implied-tag rules beyond the generic "close on matching ancestor" rule described above (e.g. it won't auto-close a `<p>` when a new block-level element starts, the way browsers do).
- `<div/>` (or any non-void element written with a self-closing slash) is honored as self-closing rather than being treated as a stray `/` the way browsers do - a deliberate, documented deviation that makes the parser more forgiving of XML-ish input.

### Testing
- `html_samples/` contains fixtures for: plain nesting, attribute variations, void elements, malformed/unclosed/overlapping tags, `<script>`/`<style>` raw content, comments/doctype, `<textarea>`/entities (mirrors "Input Example 2"), and assorted Unicode/CDATA/stray-bracket edge cases.
- `test/run-samples.js` is a zero-dependency Node script (`node test/run-samples.js`) that runs `html2json` over every file in `html_samples/` plus a set of inline adversarial inputs, asserting it never throws and always returns a JSON-serializable value.
- `index.html` can also be opened directly in a browser to try `html2json` interactively via the "Convert to JSON" / "Input Example 1" / "Input Example 2" buttons.
