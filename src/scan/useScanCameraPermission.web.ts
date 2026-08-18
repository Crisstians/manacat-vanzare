export function useScanCameraPermission() {
  return {
    hasPermission: true,
    canRequestPermission: false,
    requestPermission: async () => true,
  };
}
