import { toSummaryPageData } from '../summaryPageData';
import { VibeReport } from '../../../services/api/contracts';

const BASE: VibeReport = {
  submission_id: 's1',
  status: 'done',
  name: 'Ronak',
  insights: [],
  tags: [],
};

describe('toSummaryPageData', () => {
  it('reads the Page-2 shape off deep_summary when present there', () => {
    const report: VibeReport = {
      ...BASE,
      deep_summary: {
        typeName: 'the hype friend',
        typeDefinition: 'you lift a room.',
        quickRows: { bring: 'energy.', notice: 'mood.', connect: 'a shared joke.', care: 'honesty.' },
        detailedOpening: 'you show up loud.',
        portrait: ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'],
        shareCaption: 'i bring the energy.',
      } as never,
    };
    expect(toSummaryPageData(report).typeName).toBe('the hype friend');
    expect(toSummaryPageData(report).portrait).toHaveLength(6);
  });

  // page2_summary._to_db_shape (backend) writes deep_summary=null for a
  // Page-2 result and puts the same fields on share_card instead, aliasing
  // typeName -> archetype and typeDefinition -> archetype_desc. Every current
  // -pipeline submission is shaped exactly like this.
  it('reads the Page-2 shape off share_card, aliased, when deep_summary is null', () => {
    const report: VibeReport = {
      ...BASE,
      deep_summary: null,
      share_card: {
        archetype: 'the hype friend',
        archetype_desc: 'you lift a room.',
        quickRows: { bring: 'energy.', notice: 'mood.', connect: 'a shared joke.', care: 'honesty.' },
        detailedOpening: 'you show up loud.',
        portrait: ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'],
        shareCaption: 'i bring the energy.',
      } as never,
    };
    const data = toSummaryPageData(report);
    expect(data.typeName).toBe('the hype friend');
    expect(data.typeDefinition).toBe('you lift a room.');
    expect(data.quickRows.bring).toBe('energy.');
    expect(data.portrait).toHaveLength(6);
  });

  it('falls back to the sparse legacy mapping when neither object has the Page-2 shape', () => {
    const report: VibeReport = {
      ...BASE,
      archetype: 'the straight shooter',
      deep_summary: { first_impression: 'calm on the surface.' } as never,
      share_card: null,
    };
    const data = toSummaryPageData(report);
    expect(data.typeName).toBe('the straight shooter');
    expect(data.portrait).toEqual(['calm on the surface.']);
  });
});
