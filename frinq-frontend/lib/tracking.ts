import fs from "fs";
import path from "path";

export interface TrackEvent {
  id: string;
  session: string;
  page: string;
  action: "view" | "click" | "select" | "submit" | "back";
  element?: string;
  identity?: { phone?: string; name?: string };
  ts: string;
  data?: Record<string, unknown>;
}

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "events.jsonl");
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const KEEP_DAYS = 30;

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "");
}

function maybeRotate() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const { size } = fs.statSync(DATA_FILE);
    if (size < MAX_SIZE) return;

    const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
    const rotated = path.join(DATA_DIR, `events-${ts}.jsonl`);
    fs.renameSync(DATA_FILE, rotated);
    fs.writeFileSync(DATA_FILE, "");

    // Delete rotated files older than KEEP_DAYS
    const cutoff = Date.now() - KEEP_DAYS * 86400_000;
    for (const f of fs.readdirSync(DATA_DIR)) {
      if (!f.startsWith("events-") || !f.endsWith(".jsonl")) continue;
      const fp = path.join(DATA_DIR, f);
      if (fs.statSync(fp).mtimeMs < cutoff) fs.unlinkSync(fp);
    }
  } catch {
    // rotation is best-effort
  }
}

export function appendEvent(event: Omit<TrackEvent, "id" | "ts">) {
  try {
    ensureFile();
    maybeRotate();
    const full: TrackEvent = {
      ...event,
      id: Math.random().toString(36).slice(2),
      ts: new Date().toISOString(),
    };
    fs.appendFileSync(DATA_FILE, JSON.stringify(full) + "\n");
  } catch (err) {
    console.error("[tracking] write failed", err);
  }
}

export function readAllEvents(): TrackEvent[] {
  try {
    ensureFile();
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

// Ordered quiz funnel pages
export const FUNNEL_PAGES = [
  "/",
  "/s0",
  "/name",
  "/city",
  "/age",
  "/ready",
  "/nahh",
  "/social-type",
  "/scene",
  "/saturday-night",
  "/hobbies",
  "/interests",
  "/sweet",
  "/trip",
  "/travel-style",
  "/connection-mode",
  "/event-yes",
  "/event-no",
  "/would-rather",
  "/meeting-style",
  "/story",
  "/connection",
  "/red-flags",
  "/show-up",
  "/rapid-intro",
  "/rapid-fire",
  "/glorious",
  "/opinions",
  "/preferences-intro",
  "/preferences",
  "/last-question",
  "/vibe-box",
];

export interface SessionSummary {
  session: string;
  firstSeen: string;
  lastSeen: string;
  lastPage: string;
  pagesVisited: number;
  completed: boolean;
}

export function buildSummaries(events: TrackEvent[]): SessionSummary[] {
  const bySession: Record<string, TrackEvent[]> = {};
  for (const e of events) {
    if (!bySession[e.session]) bySession[e.session] = [];
    bySession[e.session].push(e);
  }

  return Object.entries(bySession).map(([session, evts]) => {
    const sorted = [...evts].sort((a, b) => a.ts.localeCompare(b.ts));
    const viewPages = evts.filter((e) => e.action === "view").map((e) => e.page);
    const lastPage = sorted[sorted.length - 1].page;
    return {
      session,
      firstSeen: sorted[0].ts,
      lastSeen: sorted[sorted.length - 1].ts,
      lastPage,
      pagesVisited: new Set(viewPages).size,
      completed: viewPages.includes("/vibe-box"),
    };
  });
}

export function buildFunnelCounts(events: TrackEvent[]): Record<string, number> {
  const sessionPages: Record<string, Set<string>> = {};
  for (const e of events.filter((e) => e.action === "view")) {
    if (!sessionPages[e.session]) sessionPages[e.session] = new Set();
    sessionPages[e.session].add(e.page);
  }
  const counts: Record<string, number> = {};
  for (const page of FUNNEL_PAGES) {
    counts[page] = Object.values(sessionPages).filter((s) => s.has(page)).length;
  }
  return counts;
}
