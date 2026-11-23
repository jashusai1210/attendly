export const COURSE_TARGET_PERCENTAGE = 80;
export const MAX_COURSE_DURATION_DAYS = 365;

function isValidDateString(dateString) {
  if (typeof dateString !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return false;
  }
  const date = new Date(`${dateString}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === dateString;
}

export function countWorkingDays(startDate, endDate, holidayDates = []) {
  if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
    throw new Error("Working-day range must use valid YYYY-MM-DD dates.");
  }
  if (startDate > endDate) return 0;

  const holidays = new Set(holidayDates);
  const current = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  let count = 0;
  while (current <= end) {
    const weekday = current.getUTCDay();
    const dateString = current.toISOString().slice(0, 10);
    if (weekday !== 0 && weekday !== 6 && !holidays.has(dateString)) count++;
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return count;
}

export function getStartDateForWorkingDayCount(endDate, workingDays) {
  if (!isValidDateString(endDate)) {
    throw new Error("End date must be a valid YYYY-MM-DD date.");
  }
  if (!Number.isInteger(workingDays) || workingDays < 1) {
    throw new Error("Working-day count must be a positive whole number.");
  }

  const current = new Date(`${endDate}T00:00:00.000Z`);
  let count = 0;
  while (count < workingDays) {
    const weekday = current.getUTCDay();
    if (weekday !== 0 && weekday !== 6) count++;
    if (count < workingDays) current.setUTCDate(current.getUTCDate() - 1);
  }
  return current.toISOString().slice(0, 10);
}

export function getCourseEndDate(startDate, durationDays) {
  if (!isValidDateString(startDate)) {
    throw new Error("Course start date must be a valid YYYY-MM-DD date.");
  }

  if (
    !Number.isInteger(durationDays) ||
    durationDays < 1 ||
    durationDays > MAX_COURSE_DURATION_DAYS
  ) {
    throw new Error(`Course duration must be from 1 to ${MAX_COURSE_DURATION_DAYS} days.`);
  }

  const start = new Date(`${startDate}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() + durationDays - 1);
  return start.toISOString().slice(0, 10);
}

export function isCourseInPeriod(course, dateString) {
  const date = isValidDateString(dateString)
    ? new Date(`${dateString}T00:00:00.000Z`)
    : null;
  return Boolean(
    course &&
    course.status === "active" &&
    date &&
    date.getUTCDay() !== 0 &&
    date.getUTCDay() !== 6 &&
    isValidDateString(course.startDate) &&
    isValidDateString(course.endDate) &&
    course.startDate <= course.endDate &&
    dateString >= course.startDate &&
    dateString <= course.endDate
  );
}
