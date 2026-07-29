import { nextLandingRoute } from '../AuthNavigator';

describe('reference pre-auth routing', () => {
  it('starts a new user on the reference introduction, not the former legal or quiz-intro screens', () => {
    expect(nextLandingRoute({ hasPendingAcceptance: false, hasName: false })).toBe('ReferenceIntro');
  });

  it('resumes an accepted journey at name or phone without showing a legacy intro', () => {
    expect(nextLandingRoute({ hasPendingAcceptance: true, hasName: false })).toBe('Name');
    expect(nextLandingRoute({ hasPendingAcceptance: true, hasName: true })).toBe('Phone');
  });
});
