// Data contract for the Page 2 redesign — see
// docs/quiz-upgrades/track-2-summary/figma-page-2-handoff/README-FOR-CLAUDE.md
// ("Data contract — generated content must fit the design"). `opening`,
// `closeness`, `care`, `people_and_places`, `friction`, `nudge`, and
// `type_definition` belong to the Stage-2 backend rewrite in
// CODEX-REDESIGN-SPEC.md, which has not shipped yet (STATUS.md: T2 S6 is
// still ☐). `toSummaryPageData` below bridges this contract to the fields
// the live API actually returns today (report_quote/mirror/first_impression/
// hidden_pattern/unspoken_need/narrative/read_notes/closing_line), so the
// page renders real per-user copy now and will pick up the richer fields
// automatically once the new backend ships (see the `raw.report as any`
// passthrough at the bottom of the adapter).

export interface QuickRows {
  bring: string;
  notice: string;
  connect: string;
  care: string;
}

export interface SummaryPageData {
  firstName: string;
  typeName: string; // lowercase, e.g. "the hype friend"
  typeDefinition: string;
  quickRows: QuickRows;
  detailedOpening: string;
  portrait: string[];
  shareCaption: string;
  rsvpUrl?: string;
  isPaid: boolean;
}

// ─── Loose shape of the live /api/v1/quiz/summary/:id response ─────────────
// Kept intentionally permissive (unknown-heavy) — the generation model isn't
// perfectly schema-stable, mirrors the defensive coercion already used in
// vibe-box/page.tsx.

interface RawReadNote {
  label?: unknown;
  text?: unknown;
}

interface RawDeepSummary {
  typeName?: unknown;
  typeDefinition?: unknown;
  quickRows?: Partial<Record<keyof QuickRows, unknown>>;
  detailedOpening?: unknown;
  portrait?: unknown;
  shareCaption?: unknown;
  report_quote?: unknown;
  mirror?: unknown;
  first_impression?: unknown;
  hidden_pattern?: unknown;
  unspoken_need?: unknown;
  narrative?: unknown;
  read_notes?: unknown;
  closing_line?: unknown;
}

interface RawShareCard {
  description?: unknown;
  archetype_desc?: unknown;
}

export interface RawSummary {
  name?: string | null;
  archetype?: string;
  archetype_desc?: string;
  headline?: string;
  share_quote?: string;
  share_card?: RawShareCard | null;
  deep_summary?: RawDeepSummary | null;
}

export interface RawRsvpLink {
  paid?: boolean;
  url?: string;
}

function asText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(" ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.text === "string") return o.text;
    if (typeof o.label === "string") return o.label;
    return Object.values(o).filter((x) => typeof x === "string").join(" ");
  }
  return String(v);
}

function firstNameOf(name: string | null | undefined): string {
  return (name || "").trim().split(/\s+/)[0]?.toLowerCase() || "";
}

// "Quiet Anchor" -> "the quiet anchor"; already-prefixed archetypes pass
// through untouched.
function typeNameOf(archetype: string | undefined): string {
  const clean = (archetype || "friend").trim().toLowerCase();
  return clean.startsWith("the ") ? clean : `the ${clean}`;
}

export function toSummaryPageData(raw: RawSummary, rsvpLink: RawRsvpLink | null): SummaryPageData {
  const ds = raw.deep_summary || {};
  const sc = raw.share_card || {};

  // The Luna pipeline writes the exact Page 2 contract. Keep this branch
  // first so the live client never has to reverse-map authored copy.
  if (typeof ds.typeName === "string" && typeof ds.typeDefinition === "string" && ds.quickRows && Array.isArray(ds.portrait)) {
    const q = ds.quickRows;
    return {
      firstName: firstNameOf(raw.name),
      typeName: ds.typeName,
      typeDefinition: ds.typeDefinition,
      quickRows: {
        bring: asText(q.bring), notice: asText(q.notice), connect: asText(q.connect), care: asText(q.care),
      },
      detailedOpening: asText(ds.detailedOpening),
      portrait: ds.portrait.map(asText).filter(Boolean),
      shareCaption: asText(ds.shareCaption),
      rsvpUrl: rsvpLink?.url,
      isPaid: !!rsvpLink?.paid,
    };
  }

  const reportQuote = asText(ds.report_quote);
  const mirror = asText(ds.mirror);
  const firstImpression = asText(ds.first_impression);
  const hiddenPattern = asText(ds.hidden_pattern);
  const unspokenNeed = asText(ds.unspoken_need);
  const narrative = Array.isArray(ds.narrative) ? ds.narrative.map(asText).filter(Boolean) : [];
  const readNotes = Array.isArray(ds.read_notes)
    ? (ds.read_notes as RawReadNote[]).map((n) => asText(n?.text ?? n)).filter(Boolean)
    : [];
  const closingLine = asText(ds.closing_line);

  const detailedOpening = reportQuote || narrative[0] || mirror || raw.headline || "";
  const typeDefinition = mirror || asText(sc.description) || asText(sc.archetype_desc) || detailedOpening;

  // "you bring" / "you notice" / "you connect" / "you care" — exact labels
  // per the handoff. Only `notice` has a direct 1:1 field (first_impression);
  // the rest are the closest available substitutes until Stage 2 ships.
  const quickRows: QuickRows = {
    bring: mirror || narrative[0] || detailedOpening,
    notice: firstImpression,
    connect: hiddenPattern,
    care: unspokenNeed,
  };

  const portraitCandidates = [firstImpression, hiddenPattern, unspokenNeed, ...narrative, ...readNotes, closingLine];
  const seen = new Set<string>();
  const portrait = portraitCandidates.filter((p) => {
    if (!p || seen.has(p)) return false;
    seen.add(p);
    return true;
  });

  return {
    firstName: firstNameOf(raw.name),
    typeName: typeNameOf(raw.archetype),
    typeDefinition,
    quickRows,
    detailedOpening,
    portrait: portrait.length ? portrait : [typeDefinition].filter(Boolean),
    shareCaption: raw.share_quote || reportQuote || typeDefinition,
    rsvpUrl: rsvpLink?.url,
    isPaid: !!rsvpLink?.paid,
  };
}
