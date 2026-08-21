import { useCallback, useRef } from "react";
import { StyleSheet } from "react-native";
import { Camera, CommonResolutions, useFrameOutput } from "react-native-vision-camera";
import { useBarcodeScanning, type BarcodeFormat } from "react-native-vision-camera-mlkit";
import { scheduleOnRN } from "react-native-worklets";
import type { Rect } from "../scan/scanGeometry";
import type { LiveScanCameraProps, LiveScanHit } from "./liveScanTypes";

export type { LiveScanCameraProps, LiveScanHit } from "./liveScanTypes";

const BARCODE_FORMATS: BarcodeFormat[] = [
  "EAN_13",
  "EAN_8",
  "UPC_A",
  "UPC_E",
  "QR_CODE",
  "CODE_128",
];

const BARCODE_OPTIONS = {
  formats: BARCODE_FORMATS,
  invertColors: false,
};

function boundsToRect(bounds?: { x: number; y: number; width: number; height: number } | null): Rect | null {
  "worklet";
  if (!bounds) return null;
  if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) return null;
  if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return null;
  if (bounds.width <= 0 && bounds.height <= 0) return null;
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
}

export function LiveScanCamera({ isActive, enabled, torch, onHit }: LiveScanCameraProps) {
  const onHitRef = useRef(onHit);
  onHitRef.current = onHit;

  const deliverHit = useCallback((hit: LiveScanHit) => {
    onHitRef.current(hit);
  }, []);

  const { barcodeScanning } = useBarcodeScanning(BARCODE_OPTIONS);

  const frameOutput = useFrameOutput({
    targetResolution: CommonResolutions.HD_16_9,
    pixelFormat: "yuv",
    dropFramesWhileBusy: true,
    onFrame(frame) {
      "worklet";
      try {
        if (!enabled) return;

        const barcodes = barcodeScanning(frame).barcodes;
        for (let i = 0; i < barcodes.length; i += 1) {
          const barcode = barcodes[i];
          if (barcode.isPotential) continue;
          const code = (barcode.rawValue ?? barcode.displayValue ?? "").trim();
          if (!code) continue;
          scheduleOnRN(deliverHit, {
            code,
            bounds: boundsToRect(barcode.bounds),
            frameWidth: frame.width,
            frameHeight: frame.height,
          });
          return;
        }
      } finally {
        frame.dispose();
      }
    },
  });

  return (
    <Camera
      style={StyleSheet.absoluteFill}
      device="back"
      isActive={isActive}
      outputs={[frameOutput]}
      constraints={[{ resolutionBias: frameOutput }]}
      torchMode={torch ? "on" : "off"}
      resizeMode="cover"
    />
  );
}
