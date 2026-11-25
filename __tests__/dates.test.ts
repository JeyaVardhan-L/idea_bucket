import { describeDueDate, isValidIsoDate, localDateString, nextOccurrence, normaliseDueDate, startOfLocalWeek, todayForPrompt } from '../src/core/dates';

describe('dates', () => {
  const d = new Date(2026, 10, 25, 15, 30); // Wed 25 Nov 2026 local
  it('formats local dates', () => {
    expect(localDateString(d)).toBe('2026-11-25');
    expect(todayForPrompt(d)).toBe('2026-11-25 (Wednesday)');
  });
  it('validates ISO dates', () => {
    expect(isValidIsoDate('2026-02-28')).toBe(true);
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('2028-02-29')).toBe(true);
    expect(isValidIsoDate('26-1-1')).toBe(false);
    expect(normaliseDueDate('2026-12-01T00:00:00Z')).toBe('2026-12-01');
    expect(normaliseDueDate(null)).toBeNull();
    expect(normaliseDueDate('tomorrow')).toBeNull();
  });
  it('week starts on Monday', () => {
    expect(new Date(startOfLocalWeek(d.getTime())).getDate()).toBe(23);
    const sunday = new Date(2026, 10, 29, 10);
    expect(new Date(startOfLocalWeek(sunday.getTime())).getDate()).toBe(23);
  });
  it('next occurrence of digest time', () => {
    expect(nextOccurrence(d, 21, 0).getDate()).toBe(25);
    expect(nextOccurrence(new Date(2026, 10, 25, 21, 0), 21, 0).getDate()).toBe(26);
    expect(nextOccurrence(new Date(2026, 11, 31, 22), 21, 0).getFullYear()).toBe(2027);
  });
  it('describes due dates', () => {
    expect(describeDueDate('2026-11-25', d)).toBe('today');
    expect(describeDueDate('2026-11-26', d)).toBe('tomorrow');
    expect(describeDueDate('2026-11-20', d)).toMatch(/^overdue/);
    expect(describeDueDate('2026-11-27', d)).toMatch(/^Fri 27/);
  });
});
