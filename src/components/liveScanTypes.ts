import type { Rect } from "../scan/scanGeometry";

export type LiveScanHit = {
  code: string;
  bounds: Rect | null;
  frameWidth: number;
  frameHeight: number;
};

export type LiveScanCameraProps = {
  isActive: boolean;
  enabled: boolean;
  torch: boolean;
  onHit: (hit: LiveScanHit) => void;
};
