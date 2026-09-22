(function exposeRecurrenceModel(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RecurrenceModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRecurrenceModel() {
  "use strict";

  const TYPES = new Set(["none", "daily", "weekly", "monthly", "yearly"]);
  const BOUNDARY_HOUR = 4;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  const pad = value => String(value).padStart(2, "0");

  function normalizeType(value) {
    return TYPES.has(value) ? value : "none";
  }

  function emptyRecurrence() {
    return { type: "none", anchorAt: null, activeCycleKey: "", lastRolledAt: null };
  }

  function toValidDate(value) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function dateKey(prefix, date) {
    return `${prefix}:${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function getCycleKey(type, at) {
    const normalizedType = normalizeType(type);
    if (normalizedType === "none") return "";
    const shifted = toValidDate(at);
    if (!shifted) return "";
    shifted.setHours(shifted.getHours() - BOUNDARY_HOUR);

    if (normalizedType === "daily") return dateKey("D", shifted);
    if (normalizedType === "monthly") {
      return `M:${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}`;
    }
    if (normalizedType === "yearly") return `Y:${shifted.getFullYear()}`;

    const monday = new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate());
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return dateKey("W", monday);
  }

  function parseCycleKey(type, key) {
    const normalizedType = normalizeType(type);
    const text = String(key || "");
    let match;

    if (normalizedType === "daily" || normalizedType === "weekly") {
      const prefix = normalizedType === "daily" ? "D" : "W";
      match = text.match(new RegExp(`^${prefix}:(\\d{4})-(\\d{2})-(\\d{2})$`));
      if (!match) return null;
      const year = Number(match[1]);
      const month = Number(match[2]) - 1;
      const day = Number(match[3]);
      const date = new Date(year, month, day, 12);
      if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
      if (normalizedType === "weekly" && date.getDay() !== 1) return null;
      return { year, month, day };
    }

    if (normalizedType === "monthly") {
      match = text.match(/^M:(\d{4})-(\d{2})$/);
      if (!match) return null;
      const year = Number(match[1]);
      const month = Number(match[2]) - 1;
      if (month < 0 || month > 11) return null;
      return { year, month, day: 1 };
    }

    if (normalizedType === "yearly") {
      match = text.match(/^Y:(\d{4})$/);
      return match ? { year: Number(match[1]), month: 0, day: 1 } : null;
    }

    return null;
  }

  function cycleOrdinal(type, key) {
    const parts = parseCycleKey(type, key);
    if (!parts) return Number.NaN;
    if (type === "daily") return Math.floor(Date.UTC(parts.year, parts.month, parts.day) / DAY_MS);
    if (type === "weekly") return Math.floor(Date.UTC(parts.year, parts.month, parts.day) / DAY_MS / 7);
    if (type === "monthly") return parts.year * 12 + parts.month;
    if (type === "yearly") return parts.year;
    return Number.NaN;
  }

  function getCycleDistance(type, fromKey, toKey) {
    const from = cycleOrdinal(normalizeType(type), fromKey);
    const to = cycleOrdinal(normalizeType(type), toKey);
    return Number.isFinite(from) && Number.isFinite(to) ? to - from : Number.NaN;
  }

  function offsetCycleKey(type, key, amount) {
    const normalizedType = normalizeType(type);
    const parts = parseCycleKey(normalizedType, key);
    const offset = Number(amount);
    if (!parts || !Number.isInteger(offset)) return "";

    if (normalizedType === "daily" || normalizedType === "weekly") {
      const date = new Date(parts.year, parts.month, parts.day, 12);
      date.setDate(date.getDate() + offset * (normalizedType === "weekly" ? 7 : 1));
      return dateKey(normalizedType === "weekly" ? "W" : "D", date);
    }

    if (normalizedType === "monthly") {
      const total = parts.year * 12 + parts.month + offset;
      const year = Math.floor(total / 12);
      const month = ((total % 12) + 12) % 12;
      return `M:${year}-${pad(month + 1)}`;
    }

    return normalizedType === "yearly" ? `Y:${parts.year + offset}` : "";
  }

  function createRecurrence(type, anchorAt) {
    const normalizedType = normalizeType(type);
    if (normalizedType === "none") return emptyRecurrence();
    const anchor = toValidDate(anchorAt);
    if (!anchor) return emptyRecurrence();
    const normalizedAnchor = anchor.toISOString();
    return {
      type: normalizedType,
      anchorAt: normalizedAnchor,
      activeCycleKey: getCycleKey(normalizedType, anchor),
      lastRolledAt: null
    };
  }

  function normalizeRecurrence(value, remindTime = null) {
    if (!value || typeof value !== "object") return emptyRecurrence();
    const type = normalizeType(value.type);
    if (type === "none") return emptyRecurrence();
    const anchor = toValidDate(value.anchorAt || remindTime);
    if (!anchor) return emptyRecurrence();

    const anchorAt = anchor.toISOString();
    const anchorCycleKey = getCycleKey(type, anchor);
    const activeCycleKey = Number.isFinite(getCycleDistance(type, anchorCycleKey, value.activeCycleKey))
      ? value.activeCycleKey
      : anchorCycleKey;
    const rolled = toValidDate(value.lastRolledAt);
    return {
      type,
      anchorAt,
      activeCycleKey,
      lastRolledAt: rolled ? rolled.toISOString() : null
    };
  }

  function addCalendarPeriodsFromAnchor(anchor, type, distance) {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const day = anchor.getDate();
    const hour = anchor.getHours();
    const minute = anchor.getMinutes();
    const second = anchor.getSeconds();
    const millisecond = anchor.getMilliseconds();

    if (type === "daily" || type === "weekly") {
      return new Date(year, month, day + distance * (type === "weekly" ? 7 : 1), hour, minute, second, millisecond);
    }

    if (type === "monthly") {
      const total = year * 12 + month + distance;
      const targetYear = Math.floor(total / 12);
      const targetMonth = ((total % 12) + 12) % 12;
      const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
      return new Date(targetYear, targetMonth, Math.min(day, lastDay), hour, minute, second, millisecond);
    }

    const targetYear = year + distance;
    const lastDay = new Date(targetYear, month + 1, 0).getDate();
    return new Date(targetYear, month, Math.min(day, lastDay), hour, minute, second, millisecond);
  }

  function getOccurrenceReminder(value, cycleKey) {
    const recurrence = normalizeRecurrence(value);
    if (recurrence.type === "none") return null;
    const anchorKey = getCycleKey(recurrence.type, recurrence.anchorAt);
    const distance = getCycleDistance(recurrence.type, anchorKey, cycleKey);
    if (!Number.isFinite(distance)) return null;
    return addCalendarPeriodsFromAnchor(new Date(recurrence.anchorAt), recurrence.type, distance).toISOString();
  }

  function formatRecurrenceLabel(value) {
    const recurrence = normalizeRecurrence(value);
    if (recurrence.type === "none") return "";
    const anchor = new Date(recurrence.anchorAt);
    const time = `${pad(anchor.getHours())}:${pad(anchor.getMinutes())}`;
    if (recurrence.type === "daily") return `每天 · ${time}`;
    if (recurrence.type === "weekly") return `每周 · ${WEEKDAY_LABELS[anchor.getDay()]} ${time}`;
    if (recurrence.type === "monthly") return `每月 · ${anchor.getDate()}日 ${time}`;
    return `每年 · ${pad(anchor.getMonth() + 1)}月${pad(anchor.getDate())}日 ${time}`;
  }

  function getReminderFingerprint(task) {
    if (!task || task.systemMeta?.role === "recurrence-carryover") return "";
    const id = String(task.id || "");
    const remindTime = toValidDate(task.remindTime)?.toISOString() || "";
    if (!id || !remindTime) return "";
    const recurrence = normalizeRecurrence(task.recurrence, remindTime);
    return recurrence.type === "none"
      ? `${id}:once:${remindTime}`
      : `${id}:${recurrence.activeCycleKey}:${remindTime}`;
  }

  function getNextDailyBoundary(at = new Date()) {
    const current = toValidDate(at) || new Date();
    const boundary = new Date(current.getFullYear(), current.getMonth(), current.getDate(), BOUNDARY_HOUR, 0, 0, 0);
    if (boundary.getTime() <= current.getTime()) boundary.setDate(boundary.getDate() + 1);
    return boundary;
  }

  return {
    BOUNDARY_HOUR,
    normalizeRecurrence,
    createRecurrence,
    getCycleKey,
    getCycleDistance,
    offsetCycleKey,
    getOccurrenceReminder,
    formatRecurrenceLabel,
    getReminderFingerprint,
    getNextDailyBoundary
  };
});
