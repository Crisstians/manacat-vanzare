import { useEffect } from "react";
import { BackHandler, Platform } from "react-native";

/**
 * Pe Android, Back nu trebuie să scoată aplicația (kiosk / fixare ecran).
 * Modal-urile RN își înregistrează propriul handler după acesta, deci se închid normal.
 */
export function useStayInApp() {
  useEffect(() => {
    if (Platform.OS !== "android") return;

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, []);
}
