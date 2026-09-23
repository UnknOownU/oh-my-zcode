import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE_LAUNCHER = join(HERE, "plugin", "bin", "launch.mjs");
const TARGETS = new Map([
  ["win32/x64", ["x86_64-pc-windows-msvc", "oh-my-zcode.exe"]],
  ["darwin/x64", ["x86_64-apple-darwin", "oh-my-zcode"]],
  ["darwin/arm64", ["aarch64-apple-darwin", "oh-my-zcode"]],
  ["linux/x64", ["x86_64-unknown-linux-musl", "oh-my-zcode"]],
  ["linux/arm64", ["aarch64-unknown-linux-musl", "oh-my-zcode"]],
]);

const { assertSupportedNode, runtimeTarget } = await import(pathToFileURL(SOURCE_LAUNCHER));

for (const [key, expected] of TARGETS) {
  const [platform, arch] = key.split("/");
  assert.deepEqual(runtimeTarget(platform, arch), expected);
}
assert.throws(() => runtimeTarget("linux", "ppc64"), /unsupported platform/i);
assert.throws(() => runtimeTarget("freebsd", "x64"), /unsupported platform/i);
assert.doesNotThrow(() => assertSupportedNode("v22.0.0"));
assert.throws(() => assertSupportedNode("v21.99.0"), /Node\.js 22/i);
console.log("ok - exact five-target dispatch and Node.js 22 floor");

const [target, executable] = TARGETS.get(`${process.platform}/${process.arch}`) ?? [];
assert.ok(target && executable, "test host must be a supported launcher platform");

const makeFixture = (withRuntime = true) => {
  const root = mkdtempSync(join(tmpdir(), "oh-my-zcode-launcher-"));
  const bin = join(root, "bin");
  const payload = join(bin, target, executable);
  mkdirSync(dirname(payload), { recursive: true });
  copyFileSync(SOURCE_LAUNCHER, join(bin, "launch.mjs"));
  if (withRuntime) {
    copyFileSync(process.execPath, payload);
    if (process.platform !== "win32") chmodSync(payload, 0o644);
  }
  return { root, launcher: join(bin, "launch.mjs"), payload };
};

{
  const fixture = makeFixture();
  try {
    const child = join(fixture.root, "probe.mjs");
    writeFileSync(
      child,
      [
        "const chunks = [];",
        "for await (const chunk of process.stdin) chunks.push(chunk);",
        "console.log(JSON.stringify({",
        "  args: process.argv.slice(2),",
        "  root: process.env.ZCODE_PLUGIN_ROOT,",
        "  stdin: Buffer.concat(chunks).toString('utf8'),",
        "}));",
        "console.error('stderr-marker');",
        "process.exitCode = 37;",
      ].join("\n"),
    );
    const result = spawnSync(
      process.execPath,
      [fixture.launcher, child, "space value", "--flag=x y", ""],
      { encoding: "utf8", input: "stdin-marker" },
    );
    assert.equal(result.status, 37);
    assert.equal(result.signal, null);
    assert.match(result.stderr, /stderr-marker/);
    const observed = JSON.parse(result.stdout.trim());
    assert.deepEqual(observed.args, ["space value", "--flag=x y", ""]);
    assert.equal(observed.root, fixture.root);
    assert.equal(observed.stdin, "stdin-marker");
    if (process.platform !== "win32") {
      assert.notEqual(statSync(fixture.payload).mode & 0o100, 0);
    }
    console.log(
      process.platform === "win32"
        ? "ok - inherited stdio, exact argv, plugin root, and exit status"
        : "ok - inherited stdio, exact argv, plugin root, exit status, and Unix execute repair",
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

{
  const fixture = makeFixture(false);
  try {
    const result = spawnSync(process.execPath, [fixture.launcher, "--version"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /runtime.*missing/i);
    assert.match(result.stderr, new RegExp(target));
    console.log("ok - missing payload reports the selected target");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

if (process.platform !== "win32") {
  const fixture = makeFixture();
  try {
    const child = join(fixture.root, "signal.mjs");
    writeFileSync(child, "console.log('ready'); setInterval(() => {}, 1000);\n");
    const launcher = spawn(process.execPath, [fixture.launcher, child], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    await once(launcher.stdout, "data");
    launcher.kill("SIGTERM");
    const [code, signal] = await once(launcher, "close");
    assert.equal(code, null);
    assert.equal(signal, "SIGTERM");
    console.log("ok - SIGTERM is forwarded and preserved");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

{
  const debugBinary = join(
    HERE,
    "target",
    "debug",
    process.platform === "win32" ? "oh-my-zcode.exe" : "oh-my-zcode",
  );
  if (existsSync(debugBinary)) {
    const fixture = makeFixture(false);
    try {
      copyFileSync(debugBinary, fixture.payload);
      if (process.platform !== "win32") chmodSync(fixture.payload, 0o644);
      const result = spawnSync(process.execPath, [fixture.launcher, "--version"], {
        encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /^oh-my-zcode /);
      console.log("ok - real debug binary executes through the launcher");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  } else {
    console.log("skip - no host debug binary available for real launcher smoke");
  }
}
