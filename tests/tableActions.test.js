import { describe, it, expect, vi, beforeEach } from "vitest";
import { md } from "../app/utils/markdown.js";
import { tableRows, rowsToTsv, rowsToCsv, safeTableHtml, copyTable, downloadTable } from "../app/utils/tableActions.js";

const SOURCE = "| Name | Note |\n| --- | --- |\n| Ada | **first**, `x` |\n| Bob | said \"hi\" |\n";

function render(source = SOURCE) {
  document.body.innerHTML = `<div class="markdown-content">${md.render(source)}</div>`;
  return document.body.querySelector(".table-wrapper");
}

describe("table rendering", () => {
  it("wraps a Markdown table with copy and CSV actions", () => {
    const wrapper = render();
    expect(wrapper.querySelector("table")).toBeTruthy();
    const labels = [...wrapper.querySelectorAll(".table-action-button span")].map((s) => s.textContent);
    expect(labels).toEqual(["Copy table", "CSV"]);
  });

  it("wraps each of several tables separately", () => {
    render(`${SOURCE}\ntext\n\n${SOURCE}`);
    expect(document.querySelectorAll(".table-wrapper").length).toBe(2);
    expect(document.querySelectorAll(".table-wrapper table").length).toBe(2);
  });

  it("leaves text without a table alone", () => {
    expect(md.render("just text")).not.toContain("table-wrapper");
  });
});

describe("table text", () => {
  it("reads header and body cells as plain text", () => {
    expect(tableRows(render().querySelector("table"))).toEqual([
      ["Name", "Note"],
      ["Ada", "first, x"],
      ["Bob", "said “hi”"],
    ]);
  });

  it("builds tab-separated text", () => {
    expect(rowsToTsv([["a", "b\tc"], ["d", "e"]])).toBe("a\tb c\nd\te");
  });

  it("quotes commas, quotes and line breaks in CSV", () => {
    expect(rowsToCsv([["a,b", 'say "x"'], ["plain", "two\nlines"]])).toBe('"a,b","say ""x"""\r\nplain,"two\nlines"');
  });

  it("neutralises formula cells but keeps numbers", () => {
    expect(rowsToCsv([["=SUM(A1:A2)", "+cmd", "@x", "-5", "+1.5e3", "-12%", "- note"]])).toBe(
      "'=SUM(A1:A2),'+cmd,'@x,-5,+1.5e3,-12%,'- note",
    );
  });
});

describe("review cases", () => {
  it("exports an equation once, as its LaTeX source", () => {
    const table = render("| f |\n| --- |\n| value $x=1$ here |\n").querySelector("table");
    expect(tableRows(table)).toEqual([["f"], ["value x=1 here"]]);
  });

  it("keeps a <br> as a line break in CSV and a space in TSV", () => {
    const rows = tableRows(render("| city |\n| --- |\n| Paris<br>London |\n").querySelector("table"));
    expect(rows).toEqual([["city"], ["Paris\nLondon"]]);
    expect(rowsToCsv(rows)).toBe('city\r\n"Paris\nLondon"');
    expect(rowsToTsv(rows)).toBe("city\nParis London");
  });

  it("writes an empty cell as a quoted field", () => {
    expect(rowsToCsv([["h"], [""]])).toBe('h\r\n""');
  });

  it("neutralises formulas in the copied text and HTML", () => {
    const rows = [["name", "calc"], ["a", "=HYPERLINK(\"http://x\")"], ["b", "-3"]];
    expect(rowsToTsv(rows)).toBe("name\tcalc\na\t'=HYPERLINK(\"http://x\")\nb\t-3");
    const table = render('| name | calc |\n| --- | --- |\n| a | =HYPERLINK("http://x") |\n| b | **=1+1** |\n').querySelector("table");
    const html = safeTableHtml(table);
    expect(html).toMatch(/<td>'=HYPERLINK\([^<]*\)<\/td>/);
    expect(html).toContain("<td>'=1+1</td>");
    expect(html).toContain("<th>name</th>");
  });

  it("keeps links, images and formatting in the copied HTML", () => {
    const table = render(
      "| Source | Chart | Note |\n| --- | --- | --- |\n| [Full report](https://example.com/report) | ![Sales](https://example.com/c.png) | **bold** `x` |\n",
    ).querySelector("table");
    const html = safeTableHtml(table);
    expect(html).toContain('<a href="https://example.com/report">Full report</a>');
    expect(html).toContain('<img src="https://example.com/c.png" alt="Sales">');
    expect(html).toContain("<strong>bold</strong> <code>x</code>");
  });

  it("resolves relative links and images and guards alt text standing in for an image", () => {
    document.body.innerHTML =
      '<table><tr><td><a href="/settings">Settings</a></td><td><img src="pic.png" alt="p"></td>' +
      '<td><img src="javascript:x" alt="=1+1"></td></tr></table>';
    const html = safeTableHtml(document.querySelector("table"));
    const base = document.baseURI;
    expect(html).toContain(`<a href="${new URL("/settings", base).href}">Settings</a>`);
    expect(html).toContain(`<img src="${new URL("pic.png", base).href}" alt="p">`);
    expect(html).toContain("<td>'=1+1</td>");
  });

  it("drops unsafe markup and URL schemes from the copied HTML", () => {
    const table = document.createElement("table");
    table.innerHTML =
      '<tr><td><a href="javascript:alert(1)" onclick="x()">click</a></td><td><img src="file:///etc/passwd" alt="pic" onerror="x()"></td><td><span style="color:red" onmouseover="x()">plain</span><script>bad()</script></td></tr>';
    const html = safeTableHtml(table);
    expect(html).toBe("<table><tr><td>click</td><td>pic</td><td>plain</td></tr></table>");
  });
});

describe("table actions", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("copies the table as tab-separated text", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("ClipboardItem", undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const wrapper = render();
    const button = wrapper.querySelector(".table-action-button");
    await copyTable(button);
    expect(writeText).toHaveBeenCalledWith("Name\tNote\nAda\tfirst, x\nBob\tsaid “hi”");
    expect(button.querySelector("span").textContent).toBe("Copied!");
    expect(wrapper.querySelector("table").textContent).not.toContain("Copied!");
  });

  it("downloads the table as a CSV file", async () => {
    let blob;
    URL.createObjectURL = vi.fn((b) => { blob = b; return "blob:x"; });
    URL.revokeObjectURL = vi.fn();
    let name;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () { name = this.download; });
    downloadTable(render().querySelectorAll(".table-action-button")[1]);
    expect(name).toMatch(/^table-\d+\.csv$/);
    expect(blob.type).toBe("text/csv;charset=utf-8");
    expect(await blob.text()).toContain('Name,Note\r\nAda,"first, x"');
  });

  it("does nothing for a button outside a table", async () => {
    document.body.innerHTML = "<button id=b><span>x</span></button>";
    await copyTable(document.getElementById("b"));
    downloadTable(document.getElementById("b"));
    expect(document.getElementById("b").textContent).toBe("x");
  });
});
