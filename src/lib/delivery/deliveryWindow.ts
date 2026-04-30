// src/lib/delivery/deliveryWindow.ts

const LAGOS_TIMEZONE = "Africa/Lagos";

function getLagosDate(date = new Date()) {
  const lagosString = date.toLocaleString("en-US", {
    timeZone: LAGOS_TIMEZONE,
  });

  return new Date(lagosString);
}

function getWindowForDay(day: number) {
  // 0 = Sunday
  // 6 = Saturday

  if (day === 0) {
    return null; // closed
  }

  if (day === 6) {
    return { start: 10, end: 13 }; // Saturday 10am–1pm
  }

  return { start: 9, end: 15 }; // Monday–Friday 9am–3pm
}

export function isWithinDeliveryWindow(date = new Date()) {
  const lagosDate = getLagosDate(date);

  const day = lagosDate.getDay();
  const hour = lagosDate.getHours();

  const window = getWindowForDay(day);

  if (!window) return false;

  return hour >= window.start && hour < window.end;
}

export function getNextDeliveryWindowStart(date = new Date()) {
  let lagosDate = getLagosDate(date);

  while (true) {
    const day = lagosDate.getDay();
    const window = getWindowForDay(day);

    if (window) {
      if (lagosDate.getHours() < window.start) {
        lagosDate.setHours(window.start, 0, 0, 0);
        return lagosDate;
      }

      if (lagosDate.getHours() >= window.end) {
        lagosDate.setDate(lagosDate.getDate() + 1);
        lagosDate.setHours(0, 0, 0, 0);
        continue;
      }

      // inside window
      return lagosDate;
    }

    // Sunday → move to next day
    lagosDate.setDate(lagosDate.getDate() + 1);
    lagosDate.setHours(0, 0, 0, 0);
  }
}