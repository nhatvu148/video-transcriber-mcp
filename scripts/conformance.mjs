#!/usr/bin/env node
// MCP contract conformance check: TypeScript port vs Rust source of truth.
//
// Policy (see the project's source-of-truth decision):
//   - Rust is the source of truth. The TS package must expose the SAME MCP tool
//     contract (tool names + input schemas) as Rust, minus intentionally
//     Rust-only tools listed in RUST_ONLY below.
//   - So the invariant is: TS tools ⊆ Rust tools, with matching schemas, and any
//     Rust tool missing from TS must be explicitly allowlisted (a deliberate
//     Rust-only feature) — otherwise it's drift that needs a decision.
//
// Compares tool NAME, property NAMES, property TYPE/ENUM, and REQUIRED fields.
// Descriptions are intentionally NOT compared (TS and Rust word them differently
// and that's fine).
//
// Usage:
//   node scripts/conformance.mjs
//   RUST_MCP_BIN=/path/to/video-transcriber-mcp node scripts/conformance.mjs
//
// Exit codes: 0 = contract in sync (or Rust binary absent → skipped),
//             1 = drift detected.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Tools that are intentionally Rust-only and must NOT be ported to TS
// (e.g. LLM/embedding features that belong only in the Rust/SaaS side).
const RUST_ONLY = new Set(["search_transcripts"]);

const TS_ENTRY = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const RUST_BIN = process.env.RUST_MCP_BIN || "video-transcriber-mcp";

/** Drive an MCP stdio server through initialize + tools/list, return the tools. */
function getTools(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["pipe", "pipe", "ignore"] });
    let buf = "";
    let done = false;
    const finish = (fn, arg) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { p.kill("SIGKILL"); } catch {}
      fn(arg);
    };
    const timer = setTimeout(() => finish(reject, new Error(`${cmd}: timed out waiting for tools/list`)), 20000);

    p.on("error", (e) => finish(reject, e));
    p.on("exit", () => { if (!done) finish(reject, new Error(`${cmd}: exited before responding`)); });
    p.stdout.on("data", (d) => {
      buf += d.toString();
      for (const line of buf.split("\n")) {
        const s = line.trim();
        if (!s) continue;
        let o;
        try { o = JSON.parse(s); } catch { continue; }
        if (o.id === 2 && o.result && Array.isArray(o.result.tools)) {
          finish(resolve, o.result.tools);
          return;
        }
      }
    });

    const msgs = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "conformance", version: "1" } } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ];
    p.stdin.write(msgs.map((m) => JSON.stringify(m)).join("\n") + "\n");
  });
}

/** Canonical, description-free signature of a tool's input schema. */
function canon(tool) {
  const s = tool.inputSchema || {};
  const props = s.properties || {};
  const propStr = Object.keys(props)
    .sort()
    .map((k) => {
      const v = props[k] || {};
      const en = v.enum ? `[${[...v.enum].sort().join(",")}]` : "";
      return `${k}:${v.type || "?"}${en}`;
    })
    .join(", ");
  const req = (s.required || []).slice().sort().join(", ");
  return `props{${propStr}} required{${req}}`;
}

async function main() {
  let tsTools;
  try {
    tsTools = await getTools("node", [TS_ENTRY]);
  } catch (e) {
    console.error(`✗ Could not start the TS server (${TS_ENTRY}): ${e.message}`);
    console.error("  Did you run `npm run build`?");
    process.exit(1);
  }

  let rustTools;
  try {
    rustTools = await getTools(RUST_BIN, []);
  } catch (e) {
    // Rust binary not installed → can't compare. Skip rather than fail so this
    // works in environments without the Rust build (e.g. CI).
    console.error(`⚠ Rust server '${RUST_BIN}' unavailable (${e.message}).`);
    console.error("  Skipping conformance check. Install the Rust binary or set RUST_MCP_BIN to run it.");
    process.exit(0);
  }

  const tsMap = new Map(tsTools.map((t) => [t.name, t]));
  const rustMap = new Map(rustTools.map((t) => [t.name, t]));
  const errors = [];

  // 1. Every TS tool must exist in Rust with a matching schema (TS ⊆ Rust).
  for (const [name, tsT] of tsMap) {
    const rT = rustMap.get(name);
    if (!rT) {
      errors.push(`TS tool '${name}' has no counterpart in Rust (TS invented a tool not in the source of truth).`);
      continue;
    }
    const a = canon(tsT);
    const b = canon(rT);
    if (a !== b) {
      errors.push(`Schema mismatch for '${name}':\n      TS:   ${a}\n      Rust: ${b}`);
    }
  }

  // 2. Any Rust tool missing from TS must be an intentional Rust-only feature.
  for (const name of rustMap.keys()) {
    if (!tsMap.has(name) && !RUST_ONLY.has(name)) {
      errors.push(`Rust added tool '${name}' not present in TS. Port it, or add it to RUST_ONLY if it should stay Rust-only.`);
    }
  }

  console.log(`TS tools:   ${tsMap.size}  [${[...tsMap.keys()].join(", ")}]`);
  console.log(`Rust tools: ${rustMap.size}  [${[...rustMap.keys()].join(", ")}]`);
  const rustOnlyPresent = [...RUST_ONLY].filter((n) => rustMap.has(n));
  if (rustOnlyPresent.length) console.log(`Rust-only (allowed): ${rustOnlyPresent.join(", ")}`);
  console.log("");

  if (errors.length) {
    console.error(`✗ MCP contract drift detected (${errors.length}):\n`);
    errors.forEach((e, i) => console.error(`  ${i + 1}. ${e}`));
    process.exit(1);
  }

  console.log("✓ MCP contract in sync: every TS tool matches Rust; only allowlisted Rust-only tools differ.");
}

main().catch((e) => {
  console.error("conformance check crashed:", e);
  process.exit(1);
});
