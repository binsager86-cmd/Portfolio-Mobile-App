/**
 * Register Screen — react-hook-form + Zod, auto-login, Google Sign-In.
 *
 * On successful registration the backend returns a TokenResponse (same
 * shape as login). The auth store now persists tokens immediately so
 * the user is auto-logged-in — no redirect-to-login needed.
 */

import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
} from "react-native";
import {
  TextInput,
  Button,
  Card,
  HelperText,
  IconButton,
  Divider,
} from "react-native-paper";
import { useRouter } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { useAuthStore } from "@/services/authStore";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import { registerSchema, type RegisterFormData } from "@/lib/validationSchemas";
import { performGoogleSignIn } from "@/lib/googleAuth";

export default function RegisterScreen() {
  const router = useRouter();
  const { register, googleSignIn, loading, error, clearError } = useAuthStore();
  const { colors, toggle, mode } = useThemeStore();
  const { isDesktop } = useResponsive();

  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // react-hook-form + Zod
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      displayName: "",
      password: "",
      confirmPassword: "",
    },
    mode: "onBlur",
  });

  // Clear store error on unmount
  useEffect(() => {
    return () => clearError();
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────

  const onSubmit = async (data: RegisterFormData) => {
    const ok = await register(
      data.email.trim(),
      data.password,
      data.displayName?.trim() || undefined,
    );
    if (ok) {
      // Auto-login: authStore already persisted tokens, _layout auth guard
      // will redirect to /(tabs) automatically.
      router.replace("/(tabs)");
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const result = await performGoogleSignIn();
      if (result.success) {
        const ok = await googleSignIn(result.idToken);
        if (ok) router.replace("/(tabs)");
      } else if (!result.cancelled) {
        // Show error to user via the auth store error banner
        useAuthStore.setState({
          error: result.error || "Google Sign-In failed. Please try again.",
        });
      }
    } catch (err: any) {
      console.error("[Google Sign-In]", err);
      useAuthStore.setState({
        error: "Google Sign-In failed unexpectedly. Please try again.",
      });
    } finally {
      setGoogleLoading(false);
    }
  };

  // ── Shared input theme ────────────────────────────────────────────

  const inputTheme = {
    colors: {
      surfaceVariant: colors.bgInput,
      onSurfaceVariant: colors.textSecondary,
      placeholder: colors.textMuted,
      error: colors.danger,
    },
  };

  // ── Render ────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bgPrimary }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          isDesktop && styles.scrollDesktop,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Theme toggle */}
        <View style={styles.themeToggleRow}>
          <IconButton
            icon={mode === "dark" ? "weather-sunny" : "weather-night"}
            iconColor={colors.textSecondary}
            size={24}
            onPress={toggle}
            accessibilityLabel="Toggle theme"
          />
        </View>

        {/* Logo / Title */}
        <View style={styles.header}>
          <Text style={styles.icon}>📊</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Create Account
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Register a new portfolio account
          </Text>
        </View>

        {/* Card — Registration Form */}
        <Card
          style={[
            styles.card,
            {
              backgroundColor: colors.bgCard,
              borderColor: colors.borderColor,
            },
            isDesktop && styles.cardDesktop,
          ]}
          mode="outlined"
        >
          <Card.Content>
            {/* Server error banner */}
            {error ? (
              <View
                style={[
                  styles.errorBox,
                  { backgroundColor: colors.danger + "20" },
                ]}
              >
                <Text style={{ color: colors.danger, textAlign: "center" }}>
                  {error}
                </Text>
              </View>
            ) : null}

            {/* Email */}
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  label="Email"
                  value={value}
                  onChangeText={(t) => {
                    onChange(t);
                    if (error) clearError();
                  }}
                  onBlur={onBlur}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  disabled={loading}
                  left={<TextInput.Icon icon="email" />}
                  mode="outlined"
                  style={styles.input}
                  contentStyle={styles.inputContent}
                  outlineColor={
                    errors.email ? colors.danger : colors.borderColor
                  }
                  activeOutlineColor={colors.accentPrimary}
                  textColor={colors.textPrimary}
                  error={!!errors.email}
                  theme={inputTheme}
                />
              )}
            />
            <HelperText
              type="error"
              visible={!!errors.email}
              style={{ color: colors.danger }}
            >
              {errors.email?.message}
            </HelperText>

            {/* Display Name */}
            <Controller
              control={control}
              name="displayName"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  label="Display Name (optional)"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="words"
                  disabled={loading}
                  left={<TextInput.Icon icon="badge-account" />}
                  mode="outlined"
                  style={styles.input}
                  contentStyle={styles.inputContent}
                  outlineColor={colors.borderColor}
                  activeOutlineColor={colors.accentPrimary}
                  textColor={colors.textPrimary}
                  theme={inputTheme}
                />
              )}
            />

            {/* Password */}
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  label="Password"
                  value={value}
                  onChangeText={(t) => {
                    onChange(t);
                    if (error) clearError();
                  }}
                  onBlur={onBlur}
                  secureTextEntry={!showPassword}
                  disabled={loading}
                  left={<TextInput.Icon icon="lock" />}
                  right={
                    <TextInput.Icon
                      icon={showPassword ? "eye-off" : "eye"}
                      onPress={() => setShowPassword(!showPassword)}
                    />
                  }
                  mode="outlined"
                  style={styles.input}
                  contentStyle={styles.inputContent}
                  outlineColor={
                    errors.password ? colors.danger : colors.borderColor
                  }
                  activeOutlineColor={colors.accentPrimary}
                  textColor={colors.textPrimary}
                  error={!!errors.password}
                  theme={inputTheme}
                />
              )}
            />
            <HelperText
              type="error"
              visible={!!errors.password}
              style={{ color: colors.danger }}
            >
              {errors.password?.message}
            </HelperText>

            {/* Confirm Password */}
            <Controller
              control={control}
              name="confirmPassword"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  label="Confirm Password"
                  value={value}
                  onChangeText={(t) => {
                    onChange(t);
                    if (error) clearError();
                  }}
                  onBlur={onBlur}
                  secureTextEntry={!showPassword}
                  disabled={loading}
                  left={<TextInput.Icon icon="lock-check" />}
                  mode="outlined"
                  style={styles.input}
                  contentStyle={styles.inputContent}
                  outlineColor={
                    errors.confirmPassword ? colors.danger : colors.borderColor
                  }
                  activeOutlineColor={colors.accentPrimary}
                  textColor={colors.textPrimary}
                  error={!!errors.confirmPassword}
                  onSubmitEditing={handleSubmit(onSubmit)}
                  theme={inputTheme}
                />
              )}
            />
            <HelperText
              type="error"
              visible={!!errors.confirmPassword}
              style={{ color: colors.danger }}
            >
              {errors.confirmPassword?.message}
            </HelperText>

            {/* Create Account button */}
            <Button
              mode="contained"
              onPress={handleSubmit(onSubmit)}
              loading={loading}
              disabled={loading || googleLoading}
              style={styles.button}
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
              buttonColor={colors.accentPrimary}
              textColor="#ffffff"
            >
              Create Account
            </Button>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <Divider style={[styles.dividerLine, { backgroundColor: colors.borderColor }]} />
              <Text style={[styles.dividerText, { color: colors.textMuted }]}>
                or
              </Text>
              <Divider style={[styles.dividerLine, { backgroundColor: colors.borderColor }]} />
            </View>

            {/* Google Sign-In */}
            <Button
              mode="outlined"
              onPress={handleGoogleSignIn}
              loading={googleLoading}
              disabled={loading || googleLoading}
              icon="google"
              style={[styles.googleButton, { borderColor: colors.borderColor }]}
              contentStyle={styles.buttonContent}
              labelStyle={[styles.googleLabel, { color: colors.textPrimary }]}
            >
              Continue with Google
            </Button>

            {/* Back to Login */}
            <Button
              mode="text"
              onPress={() => router.back()}
              disabled={loading}
              style={styles.backButton}
              labelStyle={[styles.backLabel, { color: colors.accentPrimary }]}
            >
              Already have an account? Sign In
            </Button>
          </Card.Content>
        </Card>

        <Text style={[styles.footer, { color: colors.textMuted }]}>
          Portfolio Mobile — Phase 3
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  scrollDesktop: { paddingHorizontal: 48 },
  themeToggleRow: {
    position: "absolute",
    top: Platform.OS === "web" ? 16 : 48,
    right: 16,
    zIndex: 10,
  },
  header: { alignItems: "center", marginBottom: 28 },
  icon: { fontSize: 56, marginBottom: 12 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 4 },
  subtitle: { fontSize: 15 },
  card: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardDesktop: { maxWidth: 480 },
  errorBox: { borderRadius: 8, padding: 12, marginBottom: 12 },
  input: {
    marginBottom: 4,
    fontSize: 16,
    backgroundColor: "transparent",
  },
  inputContent: {
    paddingVertical: Platform.OS === "web" ? 10 : 6,
    minHeight: 52,
  },
  button: { marginTop: 12, borderRadius: 10 },
  buttonContent: { paddingVertical: 8 },
  buttonLabel: { fontSize: 16, fontWeight: "700", letterSpacing: 0.5 },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 12, fontSize: 13 },
  googleButton: { borderRadius: 10, borderWidth: 1 },
  googleLabel: { fontSize: 15, fontWeight: "600" },
  backButton: { marginTop: 8 },
  backLabel: { fontSize: 14, fontWeight: "600" },
  footer: { marginTop: 32, fontSize: 13 },
});
