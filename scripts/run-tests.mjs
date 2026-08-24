/**
 * Cross-platform test runner.
 *
 * Why this exists: each test file pulls a heavy module graph into a
 * happy-dom environment, and freed environments never fully return their
 * memory to the OS. When Vitest runs many files through the same worker
 * forks, those forks grow until they hit V8's heap limit and die mid-run
 * (flaky "heap out of memory" failures). Running each file in its own
 * short-lived process keeps memory flat regardless of suite size.
 *
 * Usage:
 *   node scripts/run-tests.mjs            # full suite
 *   node scripts/run-tests.mjs foo bar    # only files matching "foo"/"bar"
 */
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const CONCURRENCY = Number(process.env.TEST_CONCURRENCY || 3);

// Give every short-lived process generous headroom; inherited by vitest's
// own children. Harmless if the platform ignores parts of it.
if (!(process.env.NODE_OPTIONS || "").includes("--max-old-space-size")) {
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ""} --max-old-space-size=4096`.trim();
}

const filters = process.argv.slice(2);
// Recursive so component tests in tests/<dir>/ are picked up too — a flat
// readdir here once meant nested test files were silently never run.
const allFiles = readdirSync("tests", { recursive: true })
  .map((f) => f.replace(/\\/g, "/"))
  .filter((f) => f.endsWith(".test.js"))
  .map((f) => path.join("tests", f))
  .filter((f) =>
    filters.length === 0 ? true : filters.some((x) => f.includes(x)),
  );

if (allFiles.length === 0) {
  console.error("No test files matched:", filters.join(", "));
  process.exit(1);
}

function runOne(file) {
  return new Promise((resolve) => {
    const child = spawn("npx", ["vitest", "run", file], {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let output = "";
    const capture = (chunk) => {
      output += chunk.toString();
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.on("close", (code) => resolve({ file, code: code ?? 1, output }));
  });
}

async function main() {
  const queue = [...allFiles];
  const results = [];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const file = queue.shift();
      const res = await runOne(file);
      const marker = res.code === 0 ? "PASS" : "FAIL";
      console.log(`${marker}  ${res.file}`);
      if (res.code !== 0) {
        // Print the tail so failure output stays visible without noise.
        const tail = res.output.trimEnd().split(/\r?\n/).slice(-25).join("\n");
        console.error(tail);
      }
      results.push(res);
    }
  });
  await Promise.all(workers);

  const failed = results.filter((r) => r.code !== 0);
  console.log(
    `\n${results.length - failed.length}/${results.length} test files passed` +
      (failed.length ? `, ${failed.length} failed:` : "."),
  );
  for (const f of failed) console.log(`  ✗ ${f.file}`);
  process.exit(failed.length ? 1 : 0);
}

await main();
