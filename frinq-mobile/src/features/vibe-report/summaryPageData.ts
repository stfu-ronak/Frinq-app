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
 *  aren't in the generated `DeepSummary` contract type yet (that still
 *  describes the legacy deep-report shape), so they're read off a widened
 *  view of the same object rather than by casting the whole thing to `any`. */
type Page2Fields = {
  typeName?: unknown;
  typeDefinition?: unknown;
  quickRows?: Partial<Record<keyof QuickRows, unknown>>;
  detailedOpening?: unknown;
  portrait?: unknown;
  shareCaption?: unknown;
};

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

  if (typeof deep.typeName === 'string' && typeof deep.typeDefinition === 'string' && deep.quickRows && Array.isArray(deep.portrait)) {
    const q = deep.quickRows;
    return {
      firstName: firstNameOf(report.name),
      typeName: deep.typeName,
      typeDefinition: deep.typeDefinition,
      quickRows: { bring: asText(q.bring), notice: asText(q.notice), connect: asText(q.connect), care: asText(q.care) },
      detailedOpening: asText(deep.detailedOpening),
      portrait: deep.portrait.map(asText).filter(Boolean),
      shareCaption: asText(deep.shareCaption),
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

  const seen = new Set<string>();
  const portrait = [firstImpression, hiddenPattern, unspokenNeed, ...narrative, ...readNotes, closingLine].filter((p) => {
    if (!p || seen.has(p)) return false;
    seen.add(p);
    return true;
  });

  return {
    firstName: firstNameOf(report.name),
    typeName: typeNameOf(report.archetype ?? report.spirit_animal),
    typeDefinition,
    quickRows: {
      bring: mirror || narrative[0] || detailedOpening,
      notice: firstImpression,
      connect: hiddenPattern,
      care: unspokenNeed,
    },
    detailedOpening,
    portrait: portrait.length ? portrait : [typeDefinition].filter(Boolean),
    shareCaption: report.share_quote || reportQuote || typeDefinition,
  };
}
