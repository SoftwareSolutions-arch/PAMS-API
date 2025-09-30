import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Kolkata");

export const getMonthRange = (offset = 0, partial = false) => {
  const now = dayjs().tz();
  const base = now.add(offset, "month").startOf("month");
  const start = base;
  const end = partial
    ? base.add(now.date() - 1, "day").endOf("day")
    : base.endOf("month");
  return { start: start.toDate(), end: end.toDate() };
};

export const getWeekRange = (offset = 0, partial = false) => {
  const now = dayjs().tz();
  const base = now.add(offset, "week").startOf("week");
  const start = base;
  const end = partial
    ? base.add(now.day(), "day").endOf("day") // same weekday as today
    : base.endOf("week");
  return { start: start.toDate(), end: end.toDate() };
};
