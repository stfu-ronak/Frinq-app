import { maskPhone, mapDisplayNameError } from '../profileService';

describe('maskPhone', () => {
  it('masks a full E.164 Indian number, first 2 + last 2 visible', () => {
    expect(maskPhone('+919876543210')).toBe('+91 98**** **10');
  });

  it('returns an em dash for null/undefined/short numbers', () => {
    expect(maskPhone(null)).toBe('—');
    expect(maskPhone(undefined)).toBe('—');
    expect(maskPhone('12345')).toBe('—');
  });
});

describe('mapDisplayNameError', () => {
  it('maps every known backend error code to a user-facing message', () => {
    expect(mapDisplayNameError('display_name_too_short')).toMatch(/at least/i);
    expect(mapDisplayNameError('display_name_too_long')).toMatch(/40 characters/i);
    expect(mapDisplayNameError('display_name_reserved_term')).toMatch(/isn't available/i);
  });

  it('falls back to a generic message for an unrecognized code', () => {
    expect(mapDisplayNameError('something_new_the_backend_added')).toMatch(/try a different name/i);
  });
});
