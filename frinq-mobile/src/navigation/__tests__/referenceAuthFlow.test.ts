import { nextLandingRoute } from '../AuthNavigator';

describe('reference pre-auth routing', () => {
  it('starts a new user on the reference introduction, not the former legal or quiz-intro screens', () => {
    expect(nextLandingRoute({ hasPendingAcceptance: false })).toBe('ReferenceIntro');
  });

  it('resumes an accepted journey straight at phone — name is collected after OTP now, never before it', () => {
    expect(nextLandingRoute({ hasPendingAcceptance: true })).toBe('Phone');
  });
});
