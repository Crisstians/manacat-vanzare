import { useState } from "react";
import { router, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "../src/auth/AuthContext";
import { BarcodeScannerModal } from "../src/components/BarcodeScannerModal";
import { linkUnknownScannedCode, resolveScannedProduct } from "../src/scan/productScan";
import { colors, typeScale } from "../src/theme";
import { Button } from "../src/ui/Button";
import { HeaderLink } from "../src/ui/HeaderLink";

export default function ScanLinksScreen() {
  const { device, session } = useAuth();
  const [scannerOpen, setScannerOpen] = useState(false);

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: "Asociază coduri",
          headerLeft: () => <HeaderLink label="Înapoi" onPress={() => router.replace("/home")} />,
        }}
      />
      <View style={styles.body}>
        <Text style={styles.lead}>Leagă coduri de ambalaj de un produs</Text>
        <Text style={styles.detail}>
          Scanează un EAN sau QR necunoscut, caută produsul din catalog și confirmă. Poți adăuga oricâte
          coduri pe același produs (ex. vopsele pe culori) — asocierea nouă nu înlocuiește cele vechi. ID-ul
          intern și SKU-ul rămân neschimbate.
        </Text>
        <Button label="Scanează" onPress={() => setScannerOpen(true)} />
      </View>
      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        resolveProduct={resolveScannedProduct}
        onConfirm={() => setScannerOpen(false)}
        storeId={session?.staff.storeId ?? device?.storeId}
        linkUnknownCode={linkUnknownScannedCode}
        addToTicket={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: {
    flex: 1,
    padding: 32,
    maxWidth: 640,
    alignSelf: "center",
    width: "100%",
    justifyContent: "center",
    gap: 16,
  },
  lead: {
    color: colors.text,
    fontSize: typeScale.lead,
    fontWeight: "800",
  },
  detail: {
    color: colors.muted,
    fontSize: typeScale.body,
    lineHeight: 26,
  },
});
