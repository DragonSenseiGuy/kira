/**
 * Heading for the empty chat screen. Greets by name and time of day once a
 * name is set in Settings -> Customization; otherwise the generic prompt.
 *
 * @param {string|null|undefined} name - The user's name from settings.
 * @param {Date} [now] - Current time; injectable for tests.
 * @returns {string}
 */
export function welcomeHeading(name, now = new Date()) {
  // Only the first line, and capped, so a pasted paragraph cannot take over the screen.
  const first = String(name ?? "").split(/\r?\n/)[0].trim();
  const shown = Array.from(first).slice(0, 40).join("").trim();
  if (!shown) return "What can I help with?";

  const hour = now.getHours();
  let part = "evening";
  if (hour >= 5 && hour < 12) part = "morning";
  else if (hour >= 12 && hour < 18) part = "afternoon";
  return `Good ${part}, ${shown}`;
}
