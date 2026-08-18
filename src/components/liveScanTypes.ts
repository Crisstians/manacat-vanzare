import type { Rect } from "../scan/scanGeometry";

export type LiveScanHit = {
  code: string;
  source: "barcode" | "ocr";
  bounds: Rect | null;
  frameWidth: number;
  frameHeight: number;
};

export type LiveScanCameraProps = {
  isActive: boolean;
  enabled: boolean;
  torch: boolean;
  roi: Rect | null;
  onHit: (hit: LiveScanHit) => void;
};
