import { useCallback, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import { Camera, CommonResolutions, useFrameOutput } from "react-native-vision-camera";
import {
  useBarcodeScanning,
  useTextRecognition,
  type BarcodeFormat,
  type RegionOfInterest,
} from "react-native-vision-camera-mlkit";
import { scheduleOnRN } from "react-native-worklets";
import { digitsFromOcrText } from "../scan/ocrDigits";
import type { Rect } from "../scan/scanGeometry";
import type { LiveScanCameraProps, LiveScanHit } from "./liveScanTypes";

export type { LiveScanCameraProps, LiveScanHit } from "./liveScanTypes";

const BARCODE_FORMATS: BarcodeFormat[] = [
  "AZTEC",
  "EAN_13",
  "EAN_8",
  "QR_CODE",
  "PDF417",
  "UPC_E",
  "DATA_MATRIX",
  "CODE_39",
  "CODE_93",
  "ITF",
  "CODABAR",
  "CODE_128",
  "UPC_A",
];

function boundsToRect(bounds?: { x: number; y: number; width: number; height: number } | null): Rect | null {
  "worklet";
  if (!bounds) return null;
  if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) return null;
  if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return null;
  if (bounds.width <= 0 && bounds.height <= 0) return null;
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
}

export function LiveScanCamera({ isActive, enabled, torch, roi, onHit }: LiveScanCameraProps) {
  const onHitRef = useRef(onHit);
  onHitRef.current = onHit;

  const deliverHit = useCallback((hit: LiveScanHit) => {
    onHitRef.current(hit);
  }, []);

  const region = useMemo<RegionOfInterest | undefined>(() => {
    if (!roi) return undefined;
    return { x: roi.x, y: roi.y, width: roi.width, height: roi.height, unit: "normalized" };
  }, [roi]);

  const textOptions = useMemo(
    () => ({
      language: "LATIN" as const,
      invertColors: false,
      ...(region ? { roi: region } : {}),
    }),
    [region],
  );

  const barcodeOptions = useMemo(
    () => ({
      formats: BARCODE_FORMATS,
      invertColors: false,
      ...(region ? { roi: region } : {}),
    }),
    [region],
  );

  const { textRecognition } = useTextRecognition(textOptions);
  const { barcodeScanning } = useBarcodeScanning(barcodeOptions);

  const frameOutput = useFrameOutput({
    targetResolution: CommonResolutions.VGA_16_9,
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
            source: "barcode",
            bounds: boundsToRect(barcode.bounds),
            frameWidth: frame.width,
            frameHeight: frame.height,
          });
          return;
        }

        const recognized = textRecognition(frame);
        let digits = digitsFromOcrText(recognized.text);
        let lineBounds: Rect | null = null;
        const blocks = recognized.blocks;
        for (let b = 0; b < blocks.length; b += 1) {
          const lines = blocks[b].lines;
          for (let l = 0; l < lines.length; l += 1) {
            const lineDigits = digitsFromOcrText(lines[l].text);
            if (!lineDigits) continue;
            if (!digits || lineDigits.length >= digits.length) {
              digits = lineDigits;
              lineBounds = boundsToRect(lines[l].bounds);
            }
          }
        }
        if (!digits) return;
        scheduleOnRN(deliverHit, {
          code: digits,
          source: "ocr",
          bounds: lineBounds,
          frameWidth: frame.width,
          frameHeight: frame.height,
        });
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
