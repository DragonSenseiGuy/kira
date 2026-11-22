/**
 * @file messageTime.js
 * @description Short and full labels for when a message was sent.
 */

/**
 * @param {Date|string|number|null|undefined} timestamp
 * @param {Date} [now]
 * @param {string} [locale] - Defaults to the browser's locale.
 * @returns {{label: string, full: string, iso: string}|null} `label` is as
 *   short as the message's age allows (time only today, no year this year);
 *   null when the message has no usable timestamp.
 */
const formatters = new Map();

// Building an Intl.DateTimeFormat is slow, and every visible message asks for
// two on each render while a reply streams.
function formatter(locale, options) {
  const key = `${locale ?? ""}|${JSON.stringify(options)}`;
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, cached);
  }
  return cached;
}

export function messageTime(timestamp, now = new Date(), locale) {
  if (timestamp == null || timestamp === "") return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;

  const time = { hour: "numeric", minute: "2-digit" };
  const sameYear = date.getFullYear() === now.getFullYear();
  const sameDay = sameYear && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  const format = sameDay
    ? time
    : { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), ...time };

  return {
    label: formatter(locale, format).format(date),
    full: formatter(locale, { dateStyle: "full", timeStyle: "short" }).format(date),
    iso: date.toISOString(),
  };
}
