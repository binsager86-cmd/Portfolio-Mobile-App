/**
 * Logo — Saham brand mark.
 *
 * Rendered as a raster image (PNG) so the same artwork appears across the
 * splash screen, app icon, favicon, and in-app branding without drift.
 */

import React from "react";
import { Image } from "react-native";

// Same asset that powers the iOS/Android app icon and the splash screen.
const logoSource = require("../assets/images/icon.png");

export interface LogoProps {
  /** Width/height in points. Defaults to 96. */
  size?: number;
  /** Optional accessibility label for screen readers. */
  accessibilityLabel?: string;
}

export function Logo({ size = 96, accessibilityLabel = "Saham" }: LogoProps) {
  return (
    <Image
      source={logoSource}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
    />
  );
}

export default Logo;
