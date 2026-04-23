/**
 * Logo — vector rendering of the Saham brand mark.
 *
 * Rendered with `react-native-svg` so it scales crisply on every platform
 * (iOS, Android, Web) without needing multiple PNG densities.
 */

import React from "react";
import Svg, {
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

export interface LogoProps {
  /** Width/height in points. Defaults to 96. */
  size?: number;
  /** Optional accessibility label for screen readers. */
  accessibilityLabel?: string;
}

export function Logo({ size = 96, accessibilityLabel = "Saham" }: LogoProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
    >
      <Defs>
        <LinearGradient
          id="logoBg"
          x1="140"
          y1="120"
          x2="900"
          y2="920"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#08070D" />
          <Stop offset="1" stopColor="#171022" />
        </LinearGradient>
        <LinearGradient
          id="logoFg"
          x1="330"
          y1="270"
          x2="710"
          y2="760"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#D7C2FF" />
          <Stop offset="1" stopColor="#8E5BFF" />
        </LinearGradient>
      </Defs>

      <Rect x="96" y="96" width="832" height="832" rx="176" fill="url(#logoBg)" />

      <G>
        {/* Stylized S */}
        <Path
          d="M690 298C646 274 593 262 534 264C433 268 353 326 334 410C318 481 366 530 460 552L578 580C632 592 658 612 656 648C652 695 600 730 522 736C446 742 381 716 340 672L296 730C352 786 434 816 526 810C649 803 743 733 754 635C763 552 713 503 614 481L493 454C443 443 421 424 424 391C428 348 471 334 538 332C595 330 643 345 682 371L690 298Z"
          fill="url(#logoFg)"
        />

        {/* Market bars */}
        <G fill="#F6F3FF">
          <Rect x="454" y="414" width="34" height="118" rx="12" />
          <Rect x="514" y="382" width="34" height="150" rx="12" />
          <Rect x="574" y="348" width="34" height="184" rx="12" />
        </G>
      </G>
    </Svg>
  );
}

export default Logo;
