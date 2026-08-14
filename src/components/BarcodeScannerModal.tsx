import { useEffect, useRef, useState } from "react";
import { CameraView, useCameraPermissions, type BarcodeScanningResult, type BarcodeType } from "expo-camera";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, touchMin, typeScale } from "../theme";

const BARCODE_TYPES: BarcodeType[] = [
  "aztec",
  "ean13",
  "ean8",
  "qr",
  "pdf417",
  "upc_e",
  "datamatrix",
  "code39",
  "code93",
  "itf14",
  "codabar",
  "code128",
  "upc_a",
];

type BarcodeScannerModalProps = {
  visible: boolean;
  onClose: () => void;
  onScanned: (data: string) => void;
};

export function BarcodeScannerModal({ visible, onClose, onScanned }: BarcodeScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    lockedRef.current = false;
    setLocked(false);
    setTorch(false);
  }, [visible]);

  const handleBarCodeScanned = (result: BarcodeScanningResult) => {
    const data = result.data?.trim();
    if (!data || lockedRef.current) return;
    lockedRef.current = true;
    setLocked(true);
    onScanned(data);
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {!visible ? null : (
      <View style={styles.screen}>
        {!permission ? (
          <Text style={styles.message}>Se verifică permisiunea camerei…</Text>
        ) : !permission.granted ? (
          <View style={styles.permissionBox}>
            <Text style={styles.message}>
              Camera este necesară pentru scanarea codurilor de bare.
            </Text>
            {permission.canAskAgain ? (
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
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={torch}
              barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
              onBarcodeScanned={locked ? undefined : handleBarCodeScanned}
            />
            <View style={styles.overlay} pointerEvents="box-none">
              <View style={styles.topBar}>
                <Pressable style={styles.ghost} onPress={onClose}>
                  <Text style={styles.ghostText}>Închide</Text>
                </Pressable>
                <Pressable style={styles.ghost} onPress={() => setTorch((current) => !current)}>
                  <Text style={styles.ghostText}>{torch ? "Lanternă oprită" : "Lanternă"}</Text>
                </Pressable>
              </View>
              <View style={styles.frame} />
              <Text style={styles.hintOnCamera}>Îndreaptă camera spre codul de bare</Text>
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
    justifyContent: "space-between",
    padding: 24,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  frame: {
    alignSelf: "center",
    width: "55%",
    aspectRatio: 2.4,
    borderWidth: 4,
    borderColor: colors.accent,
    borderRadius: 16,
    backgroundColor: "transparent",
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
  },
  ghostText: { color: "#ffffff", fontWeight: "800", fontSize: typeScale.button },
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
