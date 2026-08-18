export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };

export function scaleIfNormalized(rect: Rect, view: Size): Rect {
  const maxX = rect.x + rect.width;
  const maxY = rect.y + rect.height;
  const looksNormalized = rect.x >= -0.05 && rect.y >= -0.05 && maxX <= 1.2 && maxY <= 1.2;
  if (!looksNormalized) return rect;
  return {
    x: rect.x * view.width,
    y: rect.y * view.height,
    width: rect.width * view.width,
    height: rect.height * view.height,
  };
}

export function mapFrameRectToView(rect: Rect, frame: Size, view: Size): Rect {
  if (frame.width <= 0 || frame.height <= 0 || view.width <= 0 || view.height <= 0) return rect;
  const scale = Math.max(view.width / frame.width, view.height / frame.height);
  const drawnWidth = frame.width * scale;
  const drawnHeight = frame.height * scale;
  const offsetX = (view.width - drawnWidth) / 2;
  const offsetY = (view.height - drawnHeight) / 2;
  return {
    x: rect.x * scale + offsetX,
    y: rect.y * scale + offsetY,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

export function isCenterInsideFrame(target: Rect, frame: Rect): boolean {
  const inset = 4;
  const cx = target.x + target.width / 2;
  const cy = target.y + target.height / 2;
  return (
    cx >= frame.x + inset &&
    cy >= frame.y + inset &&
    cx <= frame.x + frame.width - inset &&
    cy <= frame.y + frame.height - inset
  );
}

export function roisEqual(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.abs(a.x - b.x) < 0.002 &&
    Math.abs(a.y - b.y) < 0.002 &&
    Math.abs(a.width - b.width) < 0.002 &&
    Math.abs(a.height - b.height) < 0.002
  );
}

export function normalizedRoi(frame: Rect, view: Size): Rect | null {
  if (view.width <= 0 || view.height <= 0 || frame.width <= 0 || frame.height <= 0) return null;
  const x = Math.max(0, frame.x / view.width);
  const y = Math.max(0, frame.y / view.height);
  const width = Math.min(1 - x, frame.width / view.width);
  const height = Math.min(1 - y, frame.height / view.height);
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}
