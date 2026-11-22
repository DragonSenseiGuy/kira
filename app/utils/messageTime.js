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
    label: new Intl.DateTimeFormat(locale, format).format(date),
    full: new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short" }).format(date),
    iso: date.toISOString(),
  };
}
