#!/usr/bin/env node
// Infinitoken squeeze: shrinks long command output to what matters (errors,
// failures, summary) and saves the full output to .infinitoken/logs/.
// Claude Code hooks (the same script handles both):
// - PreToolUse: pipes known noisy commands (tests, builds, installs) through this
//   script, so huge output is squeezed before Claude Code truncates it.
// - PostToolUse: squeezes any other long Bash output.
// Standalone: `some-command 2>&1 | node .infinitoken/squeeze.mjs`.
// Never filters commands that read content on purpose (cat, grep, git diff…).
// Skip filtering for one command by adding `# raw` at its end.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join, relative } from "node:path";

const MIN_LINES = 60;        // shorter output is passed through untouched
const MIN_CHARS = 6000;
const HEAD = 5;
const TAIL = 20;
const BEFORE = 3;            // context kept around an important line
const AFTER = 8;
const MAX_LINES = 150;
const KEEP_LOGS = 10;

// Real failures, not just the word "error" (test titles often contain it).
const IMPORTANT = new RegExp([
  /\b[A-Z]\w*(Error|Exception)\b/,                       // TypeError, AssertionError, NullPointerException
  /\b(error|fatal|panic)(\[\w+\])?:/i,                   // error:, error[E0308]:, fatal:
  /^\s*(ERROR|ERR!|FAIL(ED|URE)?|FATAL|Traceback|not ok\b)/,
  /^\s*(E\s{2,}|>\s+\d+\s*\||✗|✕|×|●\s)/,                // pytest E, jest code frame, failure marks
  /\b\d+ (failed|failing|errors?)\b|\b(failed|failing)\b:?\s*$/i,
  /^\s*\d+\) \S/,                                        // mocha numbered failure
  /^--- FAIL|^FAIL\s|^panic:/,                           // go
  /\bwarning:/i,
].map((r) => r.source).join("|"));
const NOISE = [
  /^\s*(✓|✔|√|ok \d+|PASS\b|\.+$)/,                                 // passing tests
  /\bPASSED\b|\bpassed\b.*\(\d+(\.\d+)?\s*m?s\)$/,
  /^\s*at .*(node_modules|node:internal|<anonymous>\)?$)/,           // library stack frames
  /^\s*(npm (warn|notice|http|info|timing|verb|sill)|npm WARN deprecated)/i,
  /^(Collecting|Downloading|Requirement already satisfied|Using cached|Installing collected|Building wheel|Created wheel|Stored in directory)\b/,
  /^\s*(Compiling|Downloaded|Fresh|Checking|Updating|Locking|Adding)\s+\S+ v?\d/, // cargo
  /^(go: downloading|go: finding)/,
  /^\s*\d+(\.\d+)?%|\[\s*[=#>.\- ]{5,}\s*\]|[█▓▒░]{3,}/,             // progress bars
];

// Start of the detailed failure report that test runners print at the end.
// When present, the progress listing before it is redundant.
const REPORT = /^\s*\d+ failing\b|^=+ (FAILURES|ERRORS) =+|^Summary of all failing tests|^failures:\s*$|^Failures:\s*$|^--- FAIL/;

// Commands whose output the agent asked for in full.
const READERS = /^(cat|head|tail|sed|awk|grep|rg|ag|find|fd|ls|tree|jq|yq|nl|wc|diff|less|more|bat|stat|file|echo|printf|git\s+(diff|show|log|blame|status|grep))\b/;
const isReader = (cmd) => cmd.split(/&&|\|\||;|\|/).some((part) => READERS.test(part.trim().replace(/^(sudo|env\s+\S+=\S+)\s+/, "")));

// Noisy commands rewritten at the source by the PreToolUse hook.
const NOISY = new RegExp("^(\\S*\\/)?(" + [
  /(npm|pnpm|yarn|bun)\s+(test|t|install|i|ci|add|run\s+\S*(test|build|lint|check|e2e)\S*)/,
  /((npx|bunx|pnpm\s+exec|yarn\s+dlx)\s+)?(jest|vitest|mocha|tsc|eslint|playwright\s+test|cypress\s+run|webpack|vite\s+build|next\s+build)/,
  /(python3?\s+-m\s+)?(pytest|pip3?\s+install|tox|unittest)/,
  /(uv\s+(pip\s+install|sync|run\s+pytest))/,
  /(cargo|go)\s+(build|test|check|clippy|install|vet)/,
  /(mvn|gradle|\.\/gradlew|make|cmake|ctest|rspec|phpunit)/,
  /(dotnet\s+(build|test|restore)|docker\s+(build|compose\s+build)|bundle\s+(install|exec\s+rspec)|composer\s+install|flutter\s+(test|build)|swift\s+(build|test))/,
].map((r) => r.source).join("|") + ")(\\s|$)");
// Shell features we never rewrite around: pipes, redirects, background, subshells, cd.
const UNSAFE = /[|<>`\n]|(?<!&)&(?!&)|\$\(|(^|[;&\s])(cd|pushd|export|source|\.)\s|#/;
const isNoisy = (cmd) => !UNSAFE.test(cmd) && cmd.split("&&").every((p) => NOISY.test(p.trim()));

// Pipe mode can't see the command's exit code, so failure is read from the output.
const FAILURE = /^\s*\d+ failing\b|\b\d+ failed\b|^(FAILED|FAIL)\b|^--- FAIL|test result: FAILED|^npm (ERR!|error)|\berror TS\d+|\b\d+ problems? \(\d+ errors?|^Traceback \(most recent|^error(\[\w+\])?:|^panic:|BUILD FAILURE|BUILD FAILED|^make: \*\*\*/m;

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07]*\x07/g, "");

function clean(text) {
  // Keep only the final state of lines redrawn with carriage returns.
  const lines = stripAnsi(text).split("\n").map((l) => l.split("\r").filter(Boolean).pop() ?? "");
  const out = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    if (prev && prev.line === line) prev.count++;
    else out.push({ line, count: 1 });
  }
  return out.map(({ line, count }) => (count > 1 && line.trim() ? `${line}  [x${count}]` : line));
}

function squeeze(text, logPath) {
  const lines = clean(text);
  if (lines.length < MIN_LINES && text.length < MIN_CHARS) return null;

  const keep = new Set();
  for (let i = 0; i < Math.min(HEAD, lines.length); i++) keep.add(i);
  for (let i = Math.max(0, lines.length - TAIL); i < lines.length; i++) keep.add(i);
  const report = lines.findIndex((l) => REPORT.test(l));
  for (let i = Math.max(0, report - 2); i <= report; i++) keep.add(i);
  for (let i = Math.max(0, report); i < lines.length; i++) {
    if (!IMPORTANT.test(lines[i]) || NOISE.some((re) => re.test(lines[i]))) continue;
    for (let j = Math.max(0, i - BEFORE); j <= Math.min(lines.length - 1, i + AFTER); j++) keep.add(j);
  }

  // Fill tiny gaps so the output isn't peppered with markers.
  for (let i = 1; i < lines.length - 1; i++) {
    if (!keep.has(i) && keep.has(i - 1) && (keep.has(i + 1) || keep.has(i + 2))) keep.add(i);
  }

  const out = [];
  let skipped = 0;
  const flush = () => { if (skipped) out.push(`… ${skipped} lines omitted …`); skipped = 0; };
  for (let i = 0; i < lines.length; i++) {
    const noise = NOISE.some((re) => re.test(lines[i])) && !IMPORTANT.test(lines[i]);
    const blankRun = !lines[i].trim() && out.length && !out[out.length - 1].trim();
    if (keep.has(i) && !noise && !blankRun) { flush(); out.push(lines[i]); }
    else skipped++;
  }
  flush();

  // Hard cap: keep the start of the failures and the final summary.
  if (out.length > MAX_LINES) {
    const cut = out.length - MAX_LINES;
    out.splice(MAX_LINES - TAIL, cut, `… ${cut} more lines omitted …`);
  }
  const saved = lines.length - out.length;
  if (saved < 20) return null;
  out.push("", `[infinitoken] ${lines.length} → ${out.length} lines. Full output: ${logPath} (grep it if you need more)`);
  return out.join("\n");
}

function saveLog(dir, text) {
  const logs = join(dir, ".infinitoken", "logs");
  mkdirSync(logs, { recursive: true });
  const file = join(logs, `${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
  writeFileSync(file, text);
  const old = readdirSync(logs).filter((f) => f.endsWith(".log")).sort().slice(0, -KEEP_LOGS);
  for (const f of old) unlinkSync(join(logs, f));
  return relative(dir, file);
}

const input = readFileSync(0, "utf8");
let hook;
try { hook = JSON.parse(input); } catch { hook = null; }

if (hook?.hook_event_name === "PreToolUse") {
  const cmd = hook.tool_input?.command ?? "";
  const dir = process.env.CLAUDE_PROJECT_DIR;
  // The relative script path only resolves from the project root.
  if (!dir || hook.cwd !== dir || !isNoisy(cmd)) process.exit(0);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      updatedInput: { ...hook.tool_input, command: cmd.split("&&").map((c) => `${c.trim()} 2>&1 | node .infinitoken/squeeze.mjs`).join(" && ") },
    },
  }));
} else if (hook?.tool_response && typeof hook.tool_response.stdout === "string") {
  const res = hook.tool_response;
  const cmd = hook.tool_input?.command ?? "";
  const full = [res.stdout, res.stderr].filter(Boolean).join("\n");
  if (res.isImage || /#\s*raw\s*$/.test(cmd) || isReader(cmd) || cmd.includes(".infinitoken/squeeze.mjs")) process.exit(0);
  const dir = process.env.CLAUDE_PROJECT_DIR || hook.cwd || process.cwd();
  if (clean(full).length < MIN_LINES && full.length < MIN_CHARS) process.exit(0);
  const logPath = saveLog(dir, `$ ${cmd}\n${full}`);
  const short = squeeze(full, logPath);
  if (!short) process.exit(0);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      updatedToolOutput: { ...res, stdout: short, stderr: "" },
    },
  }));
} else {
  // Pipe mode (standalone, or set up by the PreToolUse hook).
  const dir = process.cwd();
  const short = clean(input).length >= MIN_LINES || input.length >= MIN_CHARS
    ? squeeze(input, saveLog(dir, input)) : null;
  process.stdout.write(short ?? input);
  if (FAILURE.test(stripAnsi(input))) {
    process.stdout.write("\n[infinitoken] Failure detected in the output above.\n");
    process.exitCode = 1;
  }
}
