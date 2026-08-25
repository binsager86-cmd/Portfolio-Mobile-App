import { StyleSheet, Text, View } from "react-native";

const worktreeName = process.env.EXPO_PUBLIC_WORKTREE_NAME || "unknown-worktree";
const branchName = process.env.EXPO_PUBLIC_GIT_BRANCH || "unknown-branch";

export function DevWorktreeBanner() {
  if (!__DEV__) return null;

  return (
    <View pointerEvents="none" style={styles.banner}>
      <Text style={styles.text}>{`${worktreeName} | ${branchName}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    right: 0,
    zIndex: 10000,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#111827",
    borderBottomLeftRadius: 6,
    opacity: 0.92,
  },
  text: {
    color: "#facc15",
    fontSize: 11,
    fontWeight: "700",
  },
});
