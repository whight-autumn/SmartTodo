"use strict";

const DEFAULT_WIDGET_SIZE = Object.freeze({ width: 320, height: 440 });
const RIGHT_GAP = 18;
const TOP_GAP = 24;

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeWidgetPreferences(value) {
  if (!value || typeof value !== "object") {
    return { visible: true, displayId: null, bounds: null };
  }
  const bounds = value.bounds;
  const validBounds = bounds && typeof bounds === "object"
    && ["x", "y", "width", "height"].every(key => finiteNumber(bounds[key]));
  return {
    visible: typeof value.visible === "boolean" ? value.visible : true,
    displayId: finiteNumber(value.displayId) ? value.displayId : null,
    bounds: validBounds ? {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    } : null
  };
}

function getDefaultWidgetBounds(workArea) {
  const area = workArea || { x: 0, y: 0, width: DEFAULT_WIDGET_SIZE.width, height: DEFAULT_WIDGET_SIZE.height };
  return {
    x: Math.round(area.x + area.width - DEFAULT_WIDGET_SIZE.width - RIGHT_GAP),
    y: Math.round(area.y + TOP_GAP),
    ...DEFAULT_WIDGET_SIZE
  };
}

function intersectionArea(rectangle, workArea) {
  if (!rectangle || !workArea) return 0;
  const left = Math.max(rectangle.x, workArea.x);
  const top = Math.max(rectangle.y, workArea.y);
  const right = Math.min(rectangle.x + rectangle.width, workArea.x + workArea.width);
  const bottom = Math.min(rectangle.y + rectangle.height, workArea.y + workArea.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function clampWidgetBounds(savedBounds, displays, primaryDisplay) {
  const available = (Array.isArray(displays) ? displays : []).filter(display => display?.workArea);
  const primary = primaryDisplay?.workArea ? primaryDisplay : available[0];
  if (!primary) {
    return { ...getDefaultWidgetBounds(), displayId: null };
  }
  const saved = savedBounds && typeof savedBounds === "object" ? savedBounds : null;
  const requestedDisplayId = finiteNumber(saved?.displayId) ? saved.displayId : null;
  let display = requestedDisplayId === null
    ? null
    : available.find(candidate => candidate.id === requestedDisplayId) || null;

  if (!display && saved && ["x", "y", "width", "height"].every(key => finiteNumber(saved[key]))) {
    let bestArea = 0;
    for (const candidate of available) {
      const area = intersectionArea(saved, candidate.workArea);
      if (area > bestArea) {
        bestArea = area;
        display = candidate;
      }
    }
  }
  display ||= primary;

  if (!saved || requestedDisplayId !== null && !available.some(item => item.id === requestedDisplayId)
      && intersectionArea(saved, display.workArea) === 0) {
    return { ...getDefaultWidgetBounds(display.workArea), displayId: display.id ?? null };
  }

  const area = display.workArea;
  const maximumX = area.x + Math.max(0, area.width - DEFAULT_WIDGET_SIZE.width);
  const maximumY = area.y + Math.max(0, area.height - DEFAULT_WIDGET_SIZE.height);
  return {
    x: Math.round(Math.min(maximumX, Math.max(area.x, finiteNumber(saved.x) ? saved.x : maximumX))),
    y: Math.round(Math.min(maximumY, Math.max(area.y, finiteNumber(saved.y) ? saved.y : area.y + TOP_GAP))),
    ...DEFAULT_WIDGET_SIZE,
    displayId: display.id ?? null
  };
}

module.exports = {
  DEFAULT_WIDGET_SIZE,
  RIGHT_GAP,
  TOP_GAP,
  sanitizeWidgetPreferences,
  getDefaultWidgetBounds,
  clampWidgetBounds
};
