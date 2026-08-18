import { useEffect, useRef, useState } from "react";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { isNotFoundError } from "../api/client";
import type { CatalogProduct } from "../api/productsApi";
import { isCenterInsideFrame, mapFrameRectToView, normalizedRoi, roisEqual, scaleIfNormalized, type Rect, type Size } from "../scan/scanGeometry";
import { useScanCameraPermission } from "../scan/useScanCameraPermission";
import { colors, pressedOpacity, radius, touchMin, typeScale } from "../theme";
import { Button } from "../ui/Button";
import { CatalogProductSearch, catalogDisplayName } from "./CatalogProductSearch";
import { LiveScanCamera, type LiveScanHit } from "./LiveScanCamera";

const scanBeep = require("../../assets/sounds/scan.mp3");

const SCAN_HOLD_MS = 800;
const DIM = "rgba(0,0,0,0.58)";

export type ScannedBarcodeProduct = {
  code: string;
  name: string;
  unit: string;
};

type ScanPhase =
  | "idle"
  | "holding"
  | "looking"
  | "confirm"
  | "error"
  | "unknown"
  | "pick"
  | "linkConfirm"
  | "linking";

type BarcodeScannerModalProps = {
  visible: boolean;
  onClose: () => void;
  onConfirm: (product: ScannedBarcodeProduct) => void;
  resolveProduct: (code: string) => Promise<ScannedBarcodeProduct>;
  linkUnknownCode: (code: string, productId: number) => Promise<ScannedBarcodeProduct>;
  storeId?: string;
  addToTicket?: boolean;
};

export function BarcodeScannerModal({
  visible,
  onClose,
  onConfirm,
  resolveProduct,
  linkUnknownCode,
  storeId,
  addToTicket = true,
}: BarcodeScannerModalProps) {
  const { hasPermission, canRequestPermission, requestPermission } = useScanCameraPermission();
  const scanPlayer = useAudioPlayer(scanBeep);
  const [torch, setTorch] = useState(false);
  const [scanRoi, setScanRoi] = useState<Rect | null>(null);
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [product, setProduct] = useState<ScannedBarcodeProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [pickQuery, setPickQuery] = useState("");
  const [pendingLink, setPendingLink] = useState<CatalogProduct | null>(null);
  const [justLinked, setJustLinked] = useState(false);
  const lockedRef = useRef(false);
  const ignoredCodeRef = useRef<string | null>(null);
  const lastCodeRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenRef = useRef<View>(null);
  const frameRef = useRef<View>(null);
  const viewSizeRef = useRef<Size>({ width: 0, height: 0 });
  const frameRectRef = useRef<Rect | null>(null);

  const updateFrameRect = () => {
    requestAnimationFrame(() => {
      const screen = screenRef.current;
      const frame = frameRef.current;
      if (!screen || !frame) return;
      screen.measureInWindow((sx, sy, sw, sh) => {
        if (sw > 0 && sh > 0) viewSizeRef.current = { width: sw, height: sh };
        frame.measureInWindow((fx, fy, fw, fh) => {
          if (fw <= 0 || fh <= 0) return;
          const next = { x: fx - sx, y: fy - sy, width: fw, height: fh };
          frameRectRef.current = next;
          const view = viewSizeRef.current;
          const nextRoi = normalizedRoi(next, view);
          setScanRoi((current) => (roisEqual(current, nextRoi) ? current : nextRoi));
        });
      });
    });
  };

  const resetScan = () => {
    if (delayRef.current) {
      clearTimeout(delayRef.current);
      delayRef.current = null;
    }
    requestIdRef.current += 1;
    lockedRef.current = false;
    setPhase("idle");
    setProduct(null);
    setError(null);
    setUnknownCode(null);
    setPickQuery("");
    setPendingLink(null);
    setJustLinked(false);
  };

  useEffect(() => {
    if (!visible) {
      resetScan();
      ignoredCodeRef.current = null;
      setTorch(false);
      return;
    }
    resetScan();
    setTorch(false);
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: "mixWithOthers",
    });
    return () => {
      if (delayRef.current) {
        clearTimeout(delayRef.current);
        delayRef.current = null;
      }
      requestIdRef.current += 1;
    };
  }, [visible]);

  const playScanBeep = () => {
    void scanPlayer.seekTo(0).then(() => {
      scanPlayer.play();
    });
  };

  const identifyProduct = async (data: string) => {
    const requestId = requestIdRef.current;
    setPhase("looking");
    try {
      const looked = await resolveProduct(data);
      if (requestIdRef.current !== requestId) return;
      setProduct(looked);
      setPhase("confirm");
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      if (isNotFoundError(err)) {
        setUnknownCode(data);
        setPhase("unknown");
        return;
      }
      setError(err instanceof Error ? err.message : "Produsul nu a fost găsit");
      setPhase("error");
    }
  };

  const handleLiveHit = (hit: LiveScanHit) => {
    const data = hit.code.trim();
    if (!data || lockedRef.current) return;
    if (data === ignoredCodeRef.current) return;
    const frame = frameRectRef.current;
    const view = viewSizeRef.current;
    if (!frame || view.width <= 0 || view.height <= 0) return;
    if (hit.bounds) {
      const inFrame = scaleIfNormalized(hit.bounds, { width: hit.frameWidth, height: hit.frameHeight });
      const scanned = mapFrameRectToView(inFrame, { width: hit.frameWidth, height: hit.frameHeight }, view);
      if (!isCenterInsideFrame(scanned, frame)) return;
    } else if (!scanRoi) {
      return;
    }
    lockedRef.current = true;
    ignoredCodeRef.current = null;
    lastCodeRef.current = data;
    playScanBeep();
    setPhase("holding");
    delayRef.current = setTimeout(() => {
      delayRef.current = null;
      void identifyProduct(data);
    }, SCAN_HOLD_MS);
  };

  const resumeScanning = () => {
    ignoredCodeRef.current = lastCodeRef.current;
    resetScan();
  };

  const confirmUnknownLink = async () => {
    if (!unknownCode || !pendingLink) return;
    const requestId = requestIdRef.current;
    setPhase("linking");
    try {
      const looked = await linkUnknownCode(unknownCode, pendingLink.productId);
      if (requestIdRef.current !== requestId) return;
      setProduct(looked);
      setPendingLink(null);
      setJustLinked(true);
      setPhase("confirm");
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setError(err instanceof Error ? err.message : "Asocierea a eșuat");
      setPhase("error");
    }
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {!visible ? null : (
      <View
        ref={screenRef}
        collapsable={false}
        style={styles.screen}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          viewSizeRef.current = { width, height };
          updateFrameRect();
        }}
      >
        {!hasPermission ? (
          <View style={styles.permissionBox}>
            <Text style={styles.message}>
              Camera este necesară pentru scanarea codurilor de bare și a cifrelor scrise.
            </Text>
            {canRequestPermission ? (
              <Pressable style={styles.primary} onPress={() => void requestPermission()}>
                <Text style={styles.primaryText}>Permite camera</Text>
              </Pressable>
            ) : (
              <Text style={styles.hint}>
                Permisiunea a fost refuzată. Activeaz-o din setările tabletei.
              </Text>
            )}
            <Pressable style={styles.ghostLight} onPress={onClose}>
              <Text style={styles.ghostLightText}>Închide</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <LiveScanCamera
              isActive={visible && phase !== "pick"}
              enabled={phase === "idle"}
              torch={torch}
              roi={scanRoi}
              onHit={handleLiveHit}
            />
            <View style={styles.overlay} pointerEvents="box-none">
              {phase === "pick" ? (
                <KeyboardAvoidingView
                  style={styles.pickerScreen}
                  behavior={Platform.OS === "ios" ? "padding" : undefined}
                >
                  <View style={styles.topBar}>
                    <Pressable
                      style={({ pressed }) => [styles.ghostDark, pressed && { opacity: pressedOpacity }]}
                      onPress={() => {
                        setPendingLink(null);
                        setPhase("unknown");
                      }}
                    >
                      <Text style={styles.ghostDarkText}>Înapoi</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.ghostDark, pressed && { opacity: pressedOpacity }]}
                      onPress={onClose}
                    >
                      <Text style={styles.ghostDarkText}>Închide</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.pickerTitle}>
                    Asociază codul {unknownCode} cu un produs
                  </Text>
                  <CatalogProductSearch
                    query={pickQuery}
                    onQueryChange={setPickQuery}
                    onSelect={(item) => {
                      setPendingLink(item);
                      setPhase("linkConfirm");
                    }}
                    storeId={storeId}
                    resultsFill
                    autoFocus
                  />
                </KeyboardAvoidingView>
              ) : phase === "idle" ? (
                <>
                  <View style={styles.dimTop}>
                    <View style={styles.topBar}>
                      <Pressable
                        style={({ pressed }) => [styles.ghost, pressed && { opacity: pressedOpacity }]}
                        onPress={onClose}
                      >
                        <Text style={styles.ghostText}>Închide</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [styles.ghost, pressed && { opacity: pressedOpacity }]}
                        onPress={() => setTorch((current) => !current)}
                      >
                        <Text style={styles.ghostText}>{torch ? "Lanternă oprită" : "Lanternă"}</Text>
                      </Pressable>
                    </View>
                  </View>
                  <View style={styles.scanRow} pointerEvents="none">
                    <View style={styles.dimSide} />
                    <View
                      ref={frameRef}
                      collapsable={false}
                      style={styles.frame}
                      onLayout={updateFrameRect}
                    />
                    <View style={styles.dimSide} />
                  </View>
                  <View style={styles.dimBottom}>
                    <Text style={styles.hintOnCamera}>Îndreaptă camera spre chenar — cod de bare sau cifre</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.dimFull} pointerEvents="box-none">
                    <View style={styles.topBar}>
                      <Pressable
                        style={({ pressed }) => [styles.ghost, pressed && { opacity: pressedOpacity }]}
                        onPress={onClose}
                      >
                        <Text style={styles.ghostText}>Închide</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [styles.ghost, pressed && { opacity: pressedOpacity }]}
                        onPress={() => setTorch((current) => !current)}
                      >
                        <Text style={styles.ghostText}>{torch ? "Lanternă oprită" : "Lanternă"}</Text>
                      </Pressable>
                    </View>
                    <View style={styles.promptWrap}>
                      <View style={styles.promptCard}>
                        {phase === "holding" ? (
                          <Text style={styles.promptText}>Cod detectat…</Text>
                        ) : null}
                        {phase === "looking" ? (
                          <>
                            <ActivityIndicator color={colors.accent} size="large" />
                            <Text style={styles.promptText}>Se identifică produsul…</Text>
                          </>
                        ) : null}
                        {phase === "linking" ? (
                          <>
                            <ActivityIndicator color={colors.accent} size="large" />
                            <Text style={styles.promptText}>Se asociază codul…</Text>
                          </>
                        ) : null}
                        {phase === "unknown" && unknownCode ? (
                          <>
                            <Text style={styles.promptText}>
                              A fost detectat un cod necunoscut: {unknownCode}
                            </Text>
                            <Text style={styles.promptSubtext}>
                              Vrei să-l asociezi cu un produs existent?
                            </Text>
                            <View style={styles.promptActions}>
                              <Button
                                label="Nu"
                                variant="secondary"
                                onPress={resumeScanning}
                                style={styles.promptButton}
                              />
                              <Button
                                label="Da"
                                onPress={() => {
                                  setPickQuery("");
                                  setPendingLink(null);
                                  setPhase("pick");
                                }}
                                style={styles.promptButton}
                              />
                            </View>
                          </>
                        ) : null}
                        {phase === "linkConfirm" && unknownCode && pendingLink ? (
                          <>
                            <Text style={styles.promptText}>
                              Asociezi codul {unknownCode} cu {catalogDisplayName(pendingLink)}?
                            </Text>
                            <View style={styles.promptActions}>
                              <Button
                                label="Nu"
                                variant="secondary"
                                onPress={() => {
                                  setPendingLink(null);
                                  setPhase("pick");
                                }}
                                style={styles.promptButton}
                              />
                              <Button
                                label="Da"
                                onPress={() => void confirmUnknownLink()}
                                style={styles.promptButton}
                              />
                            </View>
                          </>
                        ) : null}
                        {phase === "confirm" && product ? (
                          addToTicket ? (
                          <>
                            <Text style={styles.promptText}>
                              A fost scanat produsul {product.name}, confirmă?
                            </Text>
                            <View style={styles.promptActions}>
                              <Button
                                label="Nu"
                                variant="secondary"
                                onPress={resumeScanning}
                                style={styles.promptButton}
                              />
                              <Button
                                label="Da"
                                onPress={() => onConfirm(product)}
                                style={styles.promptButton}
                              />
                            </View>
                          </>
                          ) : (
                          <>
                            <Text style={styles.promptText}>
                              {justLinked
                                ? `Codul a fost asociat cu ${product.name}.`
                                : `Produsul ${product.name} e deja identificat.`}
                            </Text>
                            <Button
                              label="Scanează din nou"
                              variant="secondary"
                              onPress={resumeScanning}
                            />
                          </>
                          )
                        ) : null}
                        {phase === "error" ? (
                          <>
                            <Text style={styles.promptText}>{error ?? "Produsul nu a fost găsit"}</Text>
                            <Button label="Scanează din nou" variant="secondary" onPress={resumeScanning} />
                          </>
                        ) : null}
                      </View>
                    </View>
                  </View>
                </>
              )}
            </View>
          </>
        )}
      </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
  },
  overlay: {
    ...StyleSheet.absoluteFill,
  },
  dimTop: {
    flex: 1,
    backgroundColor: DIM,
    paddingHorizontal: 24,
    paddingTop: 24,
    justifyContent: "flex-start",
  },
  dimBottom: {
    flex: 1,
    backgroundColor: DIM,
    paddingHorizontal: 24,
    paddingBottom: 24,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  dimSide: {
    flex: 1,
    backgroundColor: DIM,
  },
  dimFull: {
    ...StyleSheet.absoluteFill,
    backgroundColor: DIM,
    padding: 24,
  },
  scanRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  frame: {
    width: "55%",
    aspectRatio: 2.4,
    borderWidth: 4,
    borderColor: colors.accent,
    borderRadius: 16,
    backgroundColor: "transparent",
  },
  promptWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  permissionBox: {
    gap: 16,
    paddingHorizontal: 32,
    alignItems: "center",
    maxWidth: 480,
  },
  message: {
    color: colors.text,
    fontSize: typeScale.body,
    textAlign: "center",
    lineHeight: 26,
  },
  hint: {
    color: colors.muted,
    fontSize: typeScale.body,
    textAlign: "center",
    lineHeight: 26,
  },
  hintOnCamera: {
    color: "#ffffff",
    fontSize: typeScale.body,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  promptCard: {
    alignSelf: "center",
    width: "88%",
    maxWidth: 520,
    backgroundColor: colors.panel,
    borderRadius: radius,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 24,
    gap: 16,
    alignItems: "center",
  },
  promptText: {
    color: colors.text,
    fontSize: typeScale.lead,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 32,
  },
  promptSubtext: {
    color: colors.muted,
    fontSize: typeScale.body,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 26,
  },
  pickerScreen: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.bg,
    padding: 24,
    gap: 16,
  },
  pickerTitle: {
    color: colors.text,
    fontSize: typeScale.body,
    fontWeight: "800",
    lineHeight: 26,
  },
  promptActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  promptButton: {
    flex: 1,
  },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius,
    paddingHorizontal: 24,
    minHeight: touchMin,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: colors.accentText, fontWeight: "800", fontSize: typeScale.button },
  ghost: {
    backgroundColor: "rgba(17,17,17,0.78)",
    borderRadius: radius,
    paddingHorizontal: 20,
    minHeight: touchMin,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.35)",
    overflow: "hidden",
  },
  ghostText: { color: "#ffffff", fontWeight: "800", fontSize: typeScale.button },
  ghostDark: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    paddingHorizontal: 20,
    minHeight: touchMin,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: "hidden",
  },
  ghostDarkText: { color: colors.text, fontWeight: "800", fontSize: typeScale.button },
  ghostLight: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    paddingHorizontal: 20,
    minHeight: touchMin,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  ghostLightText: { color: colors.text, fontWeight: "800", fontSize: typeScale.button },
});
