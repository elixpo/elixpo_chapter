// Format a unix epoch (seconds) as YYYY-MM-DD in an IANA timezone. Formatting
// per timestamp is what makes DST transitions land on the right local day.
export function contributionDateKey(epoch, timeZone = 'UTC') {
  if (epoch == null || epoch === '') return null;
  const seconds = Number(epoch);
  if (!Number.isFinite(seconds)) return null;
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return null;

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const value = (type) => parts.find((part) => part.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  } catch {
    // Unknown timezone names fall back to UTC rather than failing the request.
    return date.toISOString().slice(0, 10);
  }
}
