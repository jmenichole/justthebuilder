const LEVELS = { info: "INFO", warn: "WARN", error: "ERROR", debug: "DEBUG" };

function output(level, msg) {
  const stamp = new Date().toISOString();
  console.log(`[JustTheBuilder][${LEVELS[level]}][${stamp}] ${msg}`);
}

export function log(msg) { output("info", msg); }
export function warn(msg) { output("warn", msg); }
export function error(msg) { output("error", msg); }
export function debug(msg) { if (process.env.DEBUG) output("debug", msg); }
