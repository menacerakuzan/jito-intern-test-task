function convertHtml2JsonAndSet() {
  const htmlTextAreaValue = document.getElementById("html").value;
  const jsonObj = html2json(htmlTextAreaValue);
  const jsonArea = document.getElementById("json");
  jsonArea.textContent = JSON.stringify(jsonObj, null, 2);
}

/*
  html2json: converts an HTML string into a JSON tree without using any DOM
  parser (no DOMParser/innerHTML/jsdom). It is a small hand-written HTML
  tokenizer + tree builder loosely modeled on how real-world "forgiving" HTML
  parsers work (e.g. htmlparser2 / the WHATWG HTML tokenization algorithm),
  scaled down to what this task needs.

  Output node shape (chosen to mirror common parser conventions such as
  htmlparser2/hast, so it's self-describing and easy to consume/test):
    root:    { type: "root", children: [...] }
    element: { type: "element", name: "div", attributes: { id: "x" }, children: [...] }
    text:    { type: "text", value: "..." }
    comment: { type: "comment", value: "..." }
    doctype: { type: "doctype", value: "html" }

  Hard requirement from the task: this function must never throw, regardless
  of input (missing/garbled tags, huge input, non-string input, etc).
*/

// Elements that can never have children/closing tags (HTML void elements).
var VOID_ELEMENTS = {
  area: true, base: true, br: true, col: true, embed: true, hr: true,
  img: true, input: true, link: true, meta: true, param: true,
  source: true, track: true, wbr: true,
};

// "Raw text" elements: content up to the matching end tag is taken
// literally (no tag/entity parsing at all), because it may contain
// "<", ">" or quotes that are not markup (e.g. JS/CSS source).
var RAW_TEXT_ELEMENTS = { script: true, style: true };

// "Escapable raw text" elements: content is not parsed as markup either,
// but character references (&amp; etc.) are still decoded.
var ESCAPABLE_RAW_TEXT_ELEMENTS = { textarea: true, title: true };

var NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  copy: "©", reg: "®", trade: "™", hellip: "…",
  mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’",
  ldquo: "“", rdquo: "”",
};

function decodeEntities(text) {
  if (text.indexOf("&") === -1) return text;
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);?/g, function (match, body) {
    try {
      if (body.charAt(0) === "#") {
        var isHex = body.charAt(1) === "x" || body.charAt(1) === "X";
        var codePoint = isHex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        if (isNaN(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match;
        return String.fromCodePoint(codePoint);
      }
      if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body)) {
        return NAMED_ENTITIES[body];
      }
      return match;
    } catch (e) {
      // Malformed entity (e.g. bad surrogate) - leave the original text alone.
      return match;
    }
  });
}

function isWhitespace(ch) {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f";
}

function isNameChar(ch) {
  return !!ch && !isWhitespace(ch) && ch !== ">" && ch !== "/" && ch !== "=";
}

// Parses a start tag's attributes starting right after the tag name.
// Returns { attributes, endIndex, selfClosing } where endIndex points
// just past the closing ">" (or past the end of the string if the tag
// was never closed - we don't throw, we just stop there).
function parseAttributes(html, index) {
  var attributes = {};
  var length = html.length;
  var selfClosing = false;

  while (index < length) {
    while (index < length && isWhitespace(html[index])) index++;
    if (index >= length) break;

    var ch = html[index];
    if (ch === ">") {
      index++;
      break;
    }
    if (ch === "/") {
      // Possible self-closing "/>" - only treat it as such if ">" follows
      // (possibly after whitespace), otherwise it's a stray "/" we skip.
      var lookahead = index + 1;
      while (lookahead < length && isWhitespace(html[lookahead])) lookahead++;
      if (html[lookahead] === ">") {
        selfClosing = true;
        index = lookahead + 1;
        break;
      }
      index++;
      continue;
    }

    var nameStart = index;
    while (index < length && isNameChar(html[index])) index++;
    var name = html.slice(nameStart, index);
    if (!name) {
      // Nothing recognizable here (e.g. a stray "="): skip one char so we
      // always make forward progress and never loop forever.
      index++;
      continue;
    }

    while (index < length && isWhitespace(html[index])) index++;

    var value = "";
    if (html[index] === "=") {
      index++;
      while (index < length && isWhitespace(html[index])) index++;
      var quote = html[index];
      if (quote === '"' || quote === "'") {
        index++;
        var valueStart = index;
        var closeQuote = html.indexOf(quote, index);
        if (closeQuote === -1) {
          value = html.slice(valueStart);
          index = length;
        } else {
          value = html.slice(valueStart, closeQuote);
          index = closeQuote + 1;
        }
      } else {
        var unquotedStart = index;
        while (index < length && !isWhitespace(html[index]) && html[index] !== ">") index++;
        value = html.slice(unquotedStart, index);
      }
      value = decodeEntities(value);
    }

    attributes[name.toLowerCase()] = value;
  }

  return { attributes: attributes, endIndex: index, selfClosing: selfClosing };
}

function tokenize(html) {
  var tokens = [];
  var length = html.length;
  var index = 0;

  while (index < length) {
    var startIndex = index;

    if (html[index] === "<") {
      // Comment.
      if (html.startsWith("<!--", index)) {
        var commentEnd = html.indexOf("-->", index + 4);
        if (commentEnd === -1) {
          tokens.push({ type: "comment", value: html.slice(index + 4) });
          index = length;
        } else {
          tokens.push({ type: "comment", value: html.slice(index + 4, commentEnd) });
          index = commentEnd + 3;
        }
      }
      // CDATA section: treated as literal text.
      else if (html.startsWith("<![CDATA[", index)) {
        var cdataEnd = html.indexOf("]]>", index + 9);
        if (cdataEnd === -1) {
          tokens.push({ type: "text", value: html.slice(index + 9) });
          index = length;
        } else {
          tokens.push({ type: "text", value: html.slice(index + 9, cdataEnd) });
          index = cdataEnd + 3;
        }
      }
      // Doctype.
      else if (/^<!doctype/i.test(html.slice(index, index + 9))) {
        var doctypeEnd = html.indexOf(">", index);
        if (doctypeEnd === -1) {
          tokens.push({ type: "doctype", value: html.slice(index + 9).trim() });
          index = length;
        } else {
          tokens.push({ type: "doctype", value: html.slice(index + 9, doctypeEnd).trim() });
          index = doctypeEnd + 1;
        }
      }
      // Other "<!...>" bangs we don't specifically support (rare, non-conforming).
      else if (html[index + 1] === "!") {
        var bangEnd = html.indexOf(">", index);
        index = bangEnd === -1 ? length : bangEnd + 1;
      }
      // End tag.
      else if (html[index + 1] === "/") {
        var nameStart = index + 2;
        var nameEnd = nameStart;
        while (nameEnd < length && isNameChar(html[nameEnd])) nameEnd++;
        var closeAngle = html.indexOf(">", nameEnd);
        var tagName = html.slice(nameStart, nameEnd).toLowerCase();
        if (!tagName) {
          // "</>" or similar with no name: ignore the bracket, not markup.
          index++;
        } else {
          tokens.push({ type: "endTag", name: tagName });
          index = closeAngle === -1 ? length : closeAngle + 1;
        }
      }
      // Start tag - must begin with a letter to count as a real tag name.
      else if (/[a-zA-Z]/.test(html[index + 1] || "")) {
        var tagNameStart = index + 1;
        var tagNameEnd = tagNameStart;
        while (tagNameEnd < length && isNameChar(html[tagNameEnd])) tagNameEnd++;
        var startTagName = html.slice(tagNameStart, tagNameEnd).toLowerCase();
        var parsed = parseAttributes(html, tagNameEnd);
        tokens.push({
          type: "startTag",
          name: startTagName,
          attributes: parsed.attributes,
          selfClosing: parsed.selfClosing,
        });
        index = parsed.endIndex;

        // Raw text / escapable raw text elements: everything up to the
        // matching end tag is not markup at all.
        if (!parsed.selfClosing && (RAW_TEXT_ELEMENTS[startTagName] || ESCAPABLE_RAW_TEXT_ELEMENTS[startTagName])) {
          var closeTagRe = new RegExp("</" + startTagName + "\\s*>", "i");
          var rest = html.slice(index);
          var match = closeTagRe.exec(rest);
          var rawContent = match ? rest.slice(0, match.index) : rest;
          if (rawContent) {
            tokens.push({
              type: "text",
              value: RAW_TEXT_ELEMENTS[startTagName] ? rawContent : decodeEntities(rawContent),
            });
          }
          if (match) {
            index += match.index + match[0].length;
            tokens.push({ type: "endTag", name: startTagName });
          } else {
            index = length;
          }
        }
      }
      // A lone "<" not starting any recognizable construct (e.g. "1 < 2" in
      // plain text, or a stray "<"): treat it as literal text so we never
      // get stuck or drop data.
      else {
        var nextLt = html.indexOf("<", index + 1);
        var textEnd = nextLt === -1 ? length : nextLt;
        tokens.push({ type: "text", value: decodeEntities(html.slice(index, textEnd)) });
        index = textEnd;
      }
    } else {
      var nextTag = html.indexOf("<", index);
      var end = nextTag === -1 ? length : nextTag;
      tokens.push({ type: "text", value: decodeEntities(html.slice(index, end)) });
      index = end;
    }

    // Safety net: a tokenizing rule must always consume at least one
    // character. If something above has a bug and index didn't move,
    // force it forward so we can never hang in an infinite loop.
    if (index <= startIndex) index = startIndex + 1;
  }

  return tokens;
}

function buildTree(tokens) {
  var root = { type: "root", children: [] };
  var stack = [root];

  function currentParent() {
    return stack[stack.length - 1];
  }

  for (var i = 0; i < tokens.length; i++) {
    var token = tokens[i];

    if (token.type === "text" || token.type === "comment" || token.type === "doctype") {
      currentParent().children.push(
        token.type === "text" ? { type: "text", value: token.value }
        : token.type === "comment" ? { type: "comment", value: token.value }
        : { type: "doctype", value: token.value }
      );
      continue;
    }

    if (token.type === "startTag") {
      var node = { type: "element", name: token.name, attributes: token.attributes, children: [] };
      currentParent().children.push(node);
      if (!token.selfClosing && !VOID_ELEMENTS[token.name]) {
        stack.push(node);
      }
      continue;
    }

    if (token.type === "endTag") {
      // Look for a matching open element on the stack (skip the root at
      // index 0). If found, close everything above it too (implied end
      // tags for whatever was left unclosed in between). If not found,
      // this is a stray closing tag with no opener - ignore it.
      var matchIndex = -1;
      for (var j = stack.length - 1; j >= 1; j--) {
        if (stack[j].name === token.name) {
          matchIndex = j;
          break;
        }
      }
      if (matchIndex !== -1) {
        stack.length = matchIndex;
      }
      continue;
    }
  }

  return root;
}

function html2json(htmlText) {
  try {
    if (typeof htmlText !== "string") {
      htmlText = htmlText === undefined || htmlText === null ? "" : String(htmlText);
    }
    var tokens = tokenize(htmlText);
    return buildTree(tokens);
  } catch (error) {
    // The task requires this function to never crash, even on inputs we
    // failed to anticipate. Fall back to a safe, still-valid result.
    return { type: "root", children: [], error: "html2json failed: " + (error && error.message ? error.message : String(error)) };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { html2json: html2json };
}

function showExample1() {
  const htmlExample = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport">
    <title>Sample HTML</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header>
        <h1>Welcome to My Website</h1>
    </header>
    <nav>
        <ul>
            <li><a href="#home">Home</a></li>
            <li><a href="#about">About</a></li>
            <li><a href="#contact">Contact</a></li>
        </ul>
    </nav>
    <main>
        <section id="home">
            <h2>Home Section</h2>
            <p>This is the home section of the webpage.</p>
        </section>
        <section id="about">
            <h2>About Section</h2>
            <p>This is the about section of the webpage.</p>
        </section>
    </main>
    <footer>
        <p>&copy; 2024 My Website</p>
    </footer>
    <script src="script.js"></script>
</body>
</html>
`;
  const jsonContent = {
    "Comment 1":
      "You have to think about how to take into account various html inputs so your json structure will cover them all and handle different cases.",
    "Comment 2":
      "When you make any choice in terms of selecting specific json structure for conversion - be ready to provide reasoning behind such choice.",
  };

  document.getElementById("html").value = htmlExample;
  document.getElementById("json").textContent = JSON.stringify(
    jsonContent,
    null,
    2
  );
}

function showExample2() {
  const htmlExample = `<div>
<p>Hello world!</p>
  <button>Click me!</button>
  <textarea>Some very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long string.</textarea>
</div>
`;
  const jsonContent = {
    "Comment 1":
      "You have to think about how to take into account various html inputs so your json structure will cover them all and handle different cases.",
    "Comment 2":
      "When you make any choice in terms of selecting specific json structure for conversion - be ready to provide reasoning behind such choice.",
  };

  document.getElementById("html").value = htmlExample;
  document.getElementById("json").textContent = JSON.stringify(
    jsonContent,
    null,
    2
  );
}
