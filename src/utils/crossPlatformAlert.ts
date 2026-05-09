import { Alert, Platform } from "react-native";

export function confirmAlert(
  title: string,
  message: string,
  onConfirm: () => void,
  onCancel?: () => void,
): void {
  if (
    Platform.OS === "web" &&
    typeof globalThis !== "undefined" &&
    typeof globalThis.confirm === "function"
  ) {
    const confirmed = globalThis.confirm(`${title}\n\n${message}`);
    if (confirmed) {
      onConfirm();
    } else {
      onCancel?.();
    }
    return;
  }

  Alert.alert(title, message, [
    {
      text: "Cancel",
      style: "cancel",
      onPress: onCancel,
    },
    {
      text: "Exit All",
      style: "destructive",
      onPress: onConfirm,
    },
  ]);
}