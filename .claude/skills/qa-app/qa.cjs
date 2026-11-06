#!/usr/bin/env node
// QA check for one weird app. Serves the repo under /weird-apps/ (like GitHub Pages),
// loads the app at desktop and phone size, and reports PASS / WARN / FAIL.
//
// Usage: node .claude/skills/qa-app/qa.cjs <folder> [--out <dir>]
//   <folder>  app folder relative to the repo root, e.g. 03-the-button-that-remembers,
//             or "." for the root launcher.
"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

let playwright;
try {
  playwright = require("playwright");
} catch {
  console.error("Playwright is not installed. Install it (npm i -g playwright) and retry.");
  process.exit(2);
}
const { chromium, devices } = playwright;

const REPO_ROOT = path.resolve(__dirname, "../../..");
const BASE_PATH = "/weird-apps/";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const VIEWPORTS = [
  { name: "desktop", options: { viewport: { width: 1280, height: 800 } } },
  { name: "phone", options: { ...devices["iPhone 13"] } },
];

// ---------- arguments ----------

function parseArgs(argv) {
  const args = { folder: null, out: path.join(os.tmpdir(), "weird-apps-qa") };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") args.out = path.resolve(argv[++i] || args.out);
    else if (!args.folder) args.folder = argv[i];
  }
  if (!args.folder) {
    console.error("Usage: node .claude/skills/qa-app/qa.cjs <folder> [--out <dir>]");
    process.exit(2);
  }
  args.folder = args.folder.replace(/^\.\/|\/+$/g, "") || ".";
  return args;
}

// ---------- static server that mimics GitHub Pages ----------

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (!urlPath.startsWith(BASE_PATH)) return notFound(res);

    let filePath = path.join(REPO_ROOT, urlPath.slice(BASE_PATH.length));
    if (!filePath.startsWith(REPO_ROOT)) return notFound(res);
    try {
      if (fs.statSync(filePath).isDirectory()) {
        if (!urlPath.endsWith("/")) {
          res.writeHead(301, { Location: urlPath + "/" });
          return res.end();
        }
        filePath = path.join(filePath, "index.html");
      }
      const body = fs.readFileSync(filePath);
      const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": type });
      res.end(body);
    } catch {
      notFound(res);
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
}

// ---------- checks ----------

const results = [];
function report(level, view, message) {
  results.push({ level, view, message });
}

// Runs in the page: elements a screen reader couldn't name.
function findUnnamedControls() {
  const selector =
    'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="link"]';
  const textOf = (id) => document.getElementById(id)?.textContent.trim() || "";
  const unnamed = [];
  for (const el of document.querySelectorAll(selector)) {
    const labelledBy = (el.getAttribute("aria-labelledby") || "")
      .split(/\s+/).filter(Boolean).map(textOf).join(" ");
    const label =
      (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent) ||
      el.closest("label")?.textContent || "";
    const imgAlt = [...el.querySelectorAll("img[alt]")].map((img) => img.alt).join(" ");
    const name = [
      el.getAttribute("aria-label"), labelledBy, el.textContent, label, imgAlt,
      el.getAttribute("title"),
      ["button", "submit", "reset"].includes(el.type) ? el.value : "",
    ].join(" ").trim();
    if (!name) unnamed.push(el.outerHTML.slice(0, 80));
  }
  return unnamed;
}

// Runs in the page after one Tab press.
function describeFocus() {
  const el = document.activeElement;
  if (!el || el === document.body) return { reached: false };
  const style = getComputedStyle(el);
  const hasOutline = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
  const hasShadow = style.boxShadow && style.boxShadow !== "none";
  return { reached: true, visible: hasOutline || hasShadow, tag: el.outerHTML.slice(0, 80) };
}

async function checkViewport(browser, appUrl, origin, view, outDir) {
  const context = await browser.newContext(view.options);
  const page = await context.newPage();
  const errors = [];
  const failed = new Map(); // url -> reason; first reason wins
  const external = new Set();

  page.on("pageerror", (err) => errors.push(`Uncaught: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (!["data:", "blob:"].includes(url.protocol) && url.origin !== origin) {
      external.add(url.origin + url.pathname);
    }
  });
  page.on("requestfailed", (req) => {
    if (new URL(req.url()).origin === origin) {
      if (!failed.has(req.url())) failed.set(req.url(), req.failure()?.errorText);
    }
  });
  page.on("response", (res) => {
    if (res.status() >= 400 && new URL(res.url()).origin === origin) {
      if (!failed.has(res.url())) failed.set(res.url(), `HTTP ${res.status()}`);
    }
  });

  const response = await page.goto(appUrl, { waitUntil: "networkidle" }).catch((e) => {
    errors.push(`Could not load page: ${e.message}`);
    return null;
  });
  if (!response || !response.ok()) {
    report("FAIL", view.name, `Page did not load (${response ? "HTTP " + response.status() : "no response"})`);
    await context.close();
    return;
  }
  await page.waitForTimeout(500);

  const screenshot = path.join(outDir, `${view.name}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });

  // De-duplicate: a failed request often also logs a console error.
  for (const e of new Set(errors)) report("FAIL", view.name, e);
  for (const [url, reason] of failed) report("FAIL", view.name, `Request failed: ${url} (${reason})`);
  for (const x of external) {
    report("WARN", view.name, `External request (must be in the approved pitch): ${x}`);
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 0) report("FAIL", view.name, `Horizontal scroll: page is ${overflow}px too wide`);

  const imagesWithoutAlt = await page.$$eval("img:not([alt])", (imgs) => imgs.map((i) => i.src));
  for (const src of imagesWithoutAlt) report("FAIL", view.name, `<img> without alt: ${src}`);

  for (const html of await page.evaluate(findUnnamedControls)) {
    report("WARN", view.name, `Control without an accessible name: ${html}`);
  }

  if (view.name === "desktop") {
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(describeFocus);
    if (!focus.reached) report("WARN", view.name, "First Tab press didn't focus any control");
    else if (!focus.visible) report("WARN", view.name, `No visible focus style on ${focus.tag}`);
  }

  report("INFO", view.name, `Screenshot: ${screenshot}`);
  await context.close();
}

async function checkBlockedStorage(browser, appUrl) {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    for (const name of ["localStorage", "sessionStorage"]) {
      try {
        Object.defineProperty(window, name, {
          configurable: true,
          get() {
            throw new DOMException("Storage is blocked (QA check)", "SecurityError");
          },
        });
      } catch {
        // Some browsers don't allow redefining storage; skip.
      }
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto(appUrl, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(500);
  for (const e of new Set(errors)) report("FAIL", "storage", `Crashes when storage is blocked: ${e}`);
  await context.close();
}

// ---------- main ----------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const appDir = path.join(REPO_ROOT, args.folder);
  if (!fs.existsSync(path.join(appDir, "index.html"))) {
    console.error(`No index.html in ${appDir}`);
    process.exit(2);
  }
  const outDir = path.join(args.out, args.folder === "." ? "launcher" : args.folder);
  fs.mkdirSync(outDir, { recursive: true });

  const server = await startServer();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const appUrl = `${origin}${BASE_PATH}${args.folder === "." ? "" : args.folder + "/"}`;
  const browser = await chromium.launch();

  try {
    for (const view of VIEWPORTS) await checkViewport(browser, appUrl, origin, view, outDir);
    await checkBlockedStorage(browser, appUrl);
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`QA: ${args.folder} (served at ${BASE_PATH})\n`);
  for (const { level, view, message } of results) {
    console.log(`${level.padEnd(4)}  [${view}] ${message}`);
  }
  const fails = results.filter((r) => r.level === "FAIL").length;
  const warns = results.filter((r) => r.level === "WARN").length;
  console.log(`\n${fails === 0 ? "PASS" : "FAIL"}: ${fails} fail, ${warns} warn`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
