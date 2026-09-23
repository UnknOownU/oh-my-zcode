import { spawn } from "node:child_process";
import { chmodSync, existsSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TARGETS = new Map([
  ["win32/x64", ["x86_64-pc-windows-msvc", "oh-my-zcode.exe"]],
  ["darwin/x64", ["x86_64-apple-darwin", "oh-my-zcode"]],
  ["darwin/arm64", ["aarch64-apple-darwin", "oh-my-zcode"]],
  ["linux/x64", ["x86_64-unknown-linux-musl", "oh-my-zcode"]],
  ["linux/arm64", ["aarch64-unknown-linux-musl", "oh-my-zcode"]],
]);

export function runtimeTarget(platform, arch) {
  const target = TARGETS.get(`${platform}/${arch}`);
  if (!target) {
    throw new Error(
      `unsupported platform ${platform}/${arch}; supported platforms: ${[...TARGETS.keys()].join(", ")}`,
    );
  }
  return target;
}

export function assertSupportedNode(version) {
  const major = Number.parseInt(version.replace(/^v/, "").split(".", 1)[0], 10);
  if (!Number.isInteger(major) || major < 22) {
    throw new Error(`Node.js 22 or newer is required; found ${version}`);
  }
}

function ensureExecutable(binary) {
  if (!existsSync(binary) || !statSync(binary).isFile()) {
    throw new Error(
      `runtime binary missing for ${process.platform}/${process.arch}: ${binary}; reinstall oh-my-zcode from Settings > Plugins`,
    );
  }
  if (process.platform === "win32") return;
  const mode = statSync(binary).mode;
  if ((mode & 0o100) !== 0) return;
  try {
    chmodSync(binary, mode | 0o100);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `runtime binary is not owner-executable and chmod failed for ${binary}: ${detail}`,
    );
  }
}

async function main() {
  assertSupportedNode(process.version);
  const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const [target, executable] = runtimeTarget(process.platform, process.arch);
  const binary = join(pluginRoot, "bin", target, executable);
  ensureExecutable(binary);

  const child = spawn(binary, process.argv.slice(2), {
    env: { ...process.env, ZCODE_PLUGIN_ROOT: pluginRoot },
    stdio: "inherit",
    windowsHide: true,
  });
  const signals = process.platform === "win32" ? [] : ["SIGINT", "SIGTERM", "SIGHUP"];
  const handlers = new Map(
    signals.map((signal) => [signal, () => child.kill(signal)]),
  );
  for (const [signal, handler] of handlers) process.on(signal, handler);

  await new Promise((resolvePromise, rejectPromise) => {
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      for (const [name, handler] of handlers) process.off(name, handler);
      if (signal && process.platform !== "win32") {
        process.kill(process.pid, signal);
        return;
      }
      process.exitCode = code ?? 1;
      resolvePromise();
    });
  });
}

function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  try {
    await main();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`oh-my-zcode launcher: ${detail}`);
    process.exitCode = 1;
  }
}
