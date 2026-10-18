#!/usr/bin/env node
// Infinitoken codemap: writes .infinitoken/codemap.md, a compact index of files
// and their top-level symbols, so agents locate code without exploring.
// Usage: node .infinitoken/codemap.mjs [project-dir] [--stdout]
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative, dirname, extname, basename } from "node:path";

const args = process.argv.slice(2);
const toStdout = args.includes("--stdout");
const root = args.find((a) => !a.startsWith("--")) ?? process.cwd();

const MAX_FILE_BYTES = 300_000;
const MAX_SYMBOLS = 12;
const SKIP_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "out", "target", "vendor", ".next", ".nuxt",
  "coverage", "__pycache__", ".venv", "venv", ".idea", ".vscode", ".infinitoken", ".claude",
]);
const SKIP_FILES = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|Cargo\.lock|poetry\.lock|composer\.lock|go\.sum|uv\.lock|Gemfile\.lock)$|\.min\.(js|css)$|\.map$/;

// Top-level symbol patterns per language. Each regex runs per line; group 1 is the name.
const JS = [
  /^(?:module\.)?exports\.([\w$]+)\s*=/,
  /^[\w$]+(?:\.prototype)?\.([\w$]+)\s*=\s*(?:async\s+)?function/,
  /^export\s+(?:default\s+)?(?:async\s+)?function\*?\s+([\w$]+)/,
  /^export\s+(?:default\s+)?(?:abstract\s+)?class\s+([\w$]+)/,
  /^export\s+(?:const|let|var)\s+([\w$]+)/,
  /^export\s+(?:interface|type|enum)\s+([\w$]+)/,
  /^(?:async\s+)?function\*?\s+([\w$]+)/,
  /^class\s+([\w$]+)/,
];
const LANGS = {
  js: JS, jsx: JS, mjs: JS, cjs: JS, ts: JS, tsx: JS, vue: JS, svelte: JS,
  py: [/^(?:async\s+)?def\s+(\w+)/, /^class\s+(\w+)/],
  go: [/^func\s+(?:\([^)]*\)\s*)?(\w+)/, /^type\s+(\w+)/],
  rs: [/^pub(?:\([^)]*\))?\s+(?:async\s+)?(?:fn|struct|enum|trait|mod|type)\s+(\w+)/],
  rb: [/^\s{0,2}(?:def|class|module)\s+([\w:.?!]+)/],
  php: [/^(?:abstract\s+|final\s+)?(?:class|interface|trait|function)\s+(\w+)/],
  java: [/^\s{0,4}(?:public|protected)\s+(?:static\s+|final\s+|abstract\s+)*(?:class|interface|enum|record)\s+(\w+)/],
  kt: [/^(?:\w+\s+)*(?:class|interface|object|fun)\s+(\w+)/],
  cs: [/^\s{0,8}(?:public|internal)\s+(?:static\s+|sealed\s+|abstract\s+|partial\s+)*(?:class|interface|enum|record|struct)\s+(\w+)/],
  swift: [/^(?:public\s+|open\s+|final\s+)*(?:class|struct|enum|protocol|func)\s+(\w+)/],
  c: [/^(?!static)[\w\s*]+?\b(\w+)\s*\([^;]*$/], h: [/^(?:typedef\s+)?struct\s+(\w+)/],
  dart: [/^(?:abstract\s+)?class\s+(\w+)/],
  sol: [/^\s*(?:contract|library|interface)\s+(\w+)/, /^\s{4}function\s+(\w+)/],
};
const TEXT_EXT = new Set(["md", "json", "yml", "yaml", "toml", "sql", "sh", "css", "scss", "html", "prisma", "graphql"]);

function listFiles(dir) {
  try {
    const out = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
      cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20,
    });
    return out.split("\n").filter(Boolean).filter((f) => !f.split("/").some((p) => SKIP_DIRS.has(p)));
  } catch {
    const files = [];
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(join(d, e.name)); }
        else if (e.isFile()) files.push(relative(dir, join(d, e.name)));
      }
    };
    walk(dir);
    return files;
  }
}

// First meaningful line of the leading comments or docstring, as a one-line description.
// License headers, tool pragmas and "Module dependencies." are skipped.
const NOISE = /^(!|copyright|\(c\)|license|licensed|mit licensed|spdx|all rights|eslint|@ts-|prettier|type: ignore|-\*-|noqa|module dependencies)/i;
function describe(lines, name) {
  for (const raw of lines.slice(0, 20)) {
    const l = raw.trim();
    if (!l || l.startsWith("#!") || /^["']use /.test(l) || /^(\/\*+!?|\*\/|"""|''\')$/.test(l)) continue;
    const m = l.match(/^(?:\/\/+|#+|\/\*+!?|\*|"""|''\'|--|<!--)\s*(.*?)\s*(?:\*\/|"""|''\'|-->)?$/);
    if (!m) return "";
    const text = m[1];
    if (!text || NOISE.test(text) || !/\s/.test(text) || text.toLowerCase() === name.toLowerCase()) continue;
    return text.length > 90 ? text.slice(0, 87) + "..." : text;
  }
  return "";
}

function analyze(rel) {
  const abs = join(root, rel);
  let size;
  try { size = statSync(abs).size; } catch { return null; }
  const ext = extname(rel).slice(1).toLowerCase();
  const patterns = LANGS[ext];
  if (!patterns && !TEXT_EXT.has(ext)) return { rel, lines: null, desc: "", symbols: [] };
  if (size > MAX_FILE_BYTES) return { rel, lines: null, desc: "(large file)", symbols: [] };
  const text = readFileSync(abs, "utf8");
  if (text.includes("\0")) return null;
  const lines = text.split("\n");
  const symbols = [];
  if (patterns) {
    for (const line of lines) {
      for (const re of patterns) {
        const m = line.match(re);
        if (m && !symbols.includes(m[1]) && !/^(_|(if|for|while|switch|return|main|exports)$)/.test(m[1])) { symbols.push(m[1]); break; }
      }
    }
  }
  return { rel, lines: lines.length, desc: patterns ? describe(lines, basename(rel, extname(rel))) : "", symbols };
}

const files = listFiles(root).filter((f) => !SKIP_FILES.test(f)).sort();
const byDir = new Map();
for (const f of files) {
  const info = analyze(f);
  if (!info) continue;
  const d = dirname(f);
  if (!byDir.has(d)) byDir.set(d, []);
  byDir.get(d).push(info);
}

const out = [
  "# Codemap",
  "",
  `Generated by Infinitoken. ${files.length} files. Format: \`file (lines) — description: symbols\`.`,
  "Regenerate: `node .infinitoken/codemap.mjs`",
  "",
];
// Test folders, and big folders without symbols (docs, assets), collapse to one line.
const COLLAPSE = 6;
const dirs = [...byDir.keys()].sort((a, b) => (a === "." ? -1 : b === "." ? 1 : a.localeCompare(b)));
for (const d of dirs) {
  const infos = byDir.get(d);
  const heading = d === "." ? "/" : d + "/";
  const isTests = /(^|\/)(tests?|__tests__|spec|fixtures?)(\/|$)/.test(d);
  if (isTests || (infos.length >= COLLAPSE && infos.every((i) => !i.symbols.length))) {
    const names = infos.map((i) => basename(i.rel));
    const shown = names.slice(0, 10).join(", ") + (names.length > 10 ? `, +${names.length - 10}` : "");
    out.push(`## ${heading}`, `- ${infos.length} files: ${shown}`, "");
    continue;
  }
  out.push(`## ${heading}`);
  for (const { rel, lines, desc, symbols } of infos) {
    let line = `- ${basename(rel)}`;
    if (lines) line += ` (${lines})`;
    if (desc) line += ` — ${desc}`;
    if (symbols.length) {
      const shown = symbols.slice(0, MAX_SYMBOLS).join(", ");
      line += `: ${shown}${symbols.length > MAX_SYMBOLS ? `, +${symbols.length - MAX_SYMBOLS}` : ""}`;
    }
    out.push(line);
  }
  out.push("");
}
const md = out.join("\n");

if (toStdout) {
  process.stdout.write(md);
} else {
  const target = join(root, ".infinitoken", "codemap.md");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, md);
  console.log(`codemap: ${files.length} files, ~${Math.round(md.length / 4)} tokens -> .infinitoken/codemap.md`);
}
