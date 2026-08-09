// Dev runner: starts the Go API and the Next.js web server together, so
// `npm run dev` brings up the FULL stack. The browser talks only to the web
// server (same-origin /api), which proxies /api to the Go backend — if the
// backend isn't running, the gallery can't load. Running both here removes that
// footgun. Use `npm run dev:web` / `npm run dev:server` to run one at a time.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const procs = [];
let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const p of procs) {
    try { p.kill("SIGTERM"); } catch {}
  }
  setTimeout(() => {
    for (const p of procs) {
      try { p.kill("SIGKILL"); } catch {}
    }
    process.exit(code);
  }, 3000);
}

function run(name, cmd, args, opts = {}) {
  const p = spawn(cmd, args, {
    cwd: opts.cwd ?? root,
    env: { ...process.env, ...(opts.env ?? {}) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tag = `[${name}]`;
  const relay = (stream, out) => {
    let buf = "";
    stream.on("data", (d) => {
      buf += d.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) out.write(`${tag} ${line}\n`);
    });
    stream.on("end", () => { if (buf) out.write(`${tag} ${buf}\n`); });
  };
  relay(p.stdout, process.stdout);
  relay(p.stderr, process.stderr);
  p.on("error", (err) => {
    process.stderr.write(`${tag} failed to start: ${err.message}\n`);
    shutdown(1);
  });
  p.on("exit", (code, signal) => {
    process.stdout.write(`${tag} exited (code=${code} signal=${signal})\n`);
    // If either half of the stack dies, stop the other so the failure is obvious.
    shutdown(code ?? 1);
  });
  procs.push(p);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run("api", "go", ["run", "./cmd/api"], {
  cwd: join(root, "server"),
  env: { GOTOOLCHAIN: "auto" },
});
run("web", join(root, "node_modules", ".bin", "next"), ["dev", "--webpack"]);
