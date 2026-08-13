import { VibeReport, DeepSummary } from '../../services/api/contracts';

export interface QuickRows {
  bring: string;
  notice: string;
  connect: string;
  care: string;
}

export interface SummaryPageData {
  firstName: string;
  /** Lowercase, e.g. "the hype friend". */
  typeName: string;
  typeDefinition: string;
  quickRows: QuickRows;
  detailedOpening: string;
  portrait: string[];
  shareCaption: string;
}

/** The Page-2 contract fields the new backend pipeline writes directly. They
 *  aren't in the generated `DeepSummary`/`ShareCard` contract types yet (those
 *  still describe the legacy deep-report/share-card shapes), so they're read
 *  off a widened view of the object rather than by casting to `any`.
 *
 *  page2_summary._to_db_shape (backend) always writes deep_summary=null for a
 *  Page-2 result and puts the same fields on share_card instead, aliasing
 *  typeName -> archetype and typeDefinition -> archetype_desc for legacy
 *  clients. So a Page-2 report's rich fields can show up on EITHER object —
 *  checking only deep_summary (as this used to) silently drops straight to
 *  the sparse legacy mapping below for every current-pipeline report. */
type Page2Fields = {
  typeName?: unknown;
  archetype?: unknown;
  typeDefinition?: unknown;
  archetype_desc?: unknown;
  quickRows?: Partial<Record<keyof QuickRows, unknown>>;
  detailedOpening?: unknown;
  portrait?: unknown;
  shareCaption?: unknown;
};

type Page2Result = { typeName: string; typeDefinition: string; quickRows: Partial<Record<keyof QuickRows, unknown>>; detailedOpening: unknown; portrait: unknown[]; shareCaption: unknown };

function extractPage2(source: Page2Fields | null | undefined): Page2Result | null {
  if (!source) return null;
  const typeName = source.typeName ?? source.archetype;
  const typeDefinition = source.typeDefinition ?? source.archetype_desc;
  if (typeof typeName !== 'string' || typeof typeDefinition !== 'string' || !source.quickRows || !Array.isArray(source.portrait)) return null;
  return { typeName, typeDefinition, quickRows: source.quickRows, detailedOpening: source.detailedOpening, portrait: source.portrait, shareCaption: source.shareCaption };
}

function asText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text;
    if (typeof o.label === 'string') return o.label;
    return Object.values(o).filter((v): v is string => typeof v === 'string').join(' ');
  }
  return String(value);
}

/** First candidate that is both truthy and not already claimed by another
 *  field — the sparse legacy shape has several fields fall back through the
 *  same handful of source values (narrative[0], mirror, report_quote), and
 *  without this two unrelated UI slots (a quick-row card, the pull-quote)
 *  can end up showing the identical sentence. */
function firstUnclaimed(claimed: ReadonlySet<string>, ...candidates: string[]): string {
  for (const c of candidates) {
    if (c && !claimed.has(c)) return c;
  }
  return '';
}

function firstNameOf(name: string | null | undefined): string {
  return (name || '').trim().split(/\s+/)[0]?.toLowerCase() || '';
}

/** "Quiet Anchor" -> "the quiet anchor"; already-prefixed names pass through. */
function typeNameOf(archetype: string | null | undefined): string {
  const clean = (archetype || 'friend').trim().toLowerCase();
  return clean.startsWith('the ') ? clean : `the ${clean}`;
}

/**
 * Adapts the live `/api/v1/quiz/summary/{id}` response into the shape the
 * summary screen renders.
 *
 * Two paths, in priority order: the new Page-2 pipeline writes the contract
 * verbatim (typeName/typeDefinition/quickRows/portrait), so that branch wins
 * when present; otherwise the older deep-report fields are mapped onto the
 * same shape so existing users' saved summaries still render. Only `notice`
 * has a true 1:1 legacy equivalent (first_impression) — the other three rows
 * use the closest available field.
 */
export function toSummaryPageData(report: VibeReport): SummaryPageData {
  const deep: DeepSummary & Page2Fields = report.deep_summary ?? {};
  const share = report.share_card ?? null;

  const page2 = extractPage2(deep) ?? extractPage2(share as Page2Fields | null);
  if (page2) {
    const q = page2.quickRows;
    return {
      firstName: firstNameOf(report.name),
      typeName: page2.typeName,
      typeDefinition: page2.typeDefinition,
      quickRows: { bring: asText(q.bring), notice: asText(q.notice), connect: asText(q.connect), care: asText(q.care) },
      detailedOpening: asText(page2.detailedOpening),
      portrait: page2.portrait.map(asText).filter(Boolean),
      shareCaption: asText(page2.shareCaption),
    };
  }

  const reportQuote = asText(deep.report_quote);
  const mirror = asText(deep.mirror);
  const firstImpression = asText(deep.first_impression);
  const hiddenPattern = asText(deep.hidden_pattern);
  const unspokenNeed = asText(deep.unspoken_need);
  const narrative = deep.narrative?.map(asText).filter(Boolean) ?? [];
  const readNotes = deep.read_notes?.map((n) => asText(n?.text ?? n)).filter(Boolean) ?? [];
  const closingLine = asText(deep.closing_line);

  const detailedOpening = reportQuote || narrative[0] || mirror || report.headline || '';
  const typeDefinition = mirror || share?.description || share?.archetype_desc || detailedOpening;

  // Seeded with detailedOpening only: several legacy fields fall back
  // through the same handful of source values, and without this a sparse
  // record can show the identical sentence in two unrelated slots — once as
  // the pull-quote and again as a quick-row card or portrait paragraph.
  // (typeDefinition sharing a value with one of these is fine and expected —
  // e.g. bring legitimately reusing `mirror` the same way typeDefinition
  // does — so it's deliberately not included here.)
  const claimed = new Set<string>([detailedOpening].filter(Boolean));
  const portrait = [firstImpression, hiddenPattern, unspokenNeed, ...narrative, ...readNotes, closingLine].filter((p) => {
    if (!p || claimed.has(p)) return false;
    claimed.add(p);
    return true;
  });

  return {
    firstName: firstNameOf(report.name),
    typeName: typeNameOf(report.archetype ?? report.spirit_animal),
    typeDefinition,
    // bring deliberately never falls back to detailedOpening/headline itself
    // (a bare archetype label showing up as an "answer" reads as nonsense) —
    // firstUnclaimed additionally skips any candidate already used by
    // detailedOpening/typeDefinition above, so it can't duplicate those either.
    quickRows: {
      bring: firstUnclaimed(claimed, mirror, narrative[0], firstImpression),
      notice: firstImpression,
      connect: hiddenPattern,
      care: unspokenNeed,
    },
    detailedOpening,
    portrait: portrait.length ? portrait : [typeDefinition].filter(Boolean),
    shareCaption: report.share_quote || reportQuote || typeDefinition,
  };
}
