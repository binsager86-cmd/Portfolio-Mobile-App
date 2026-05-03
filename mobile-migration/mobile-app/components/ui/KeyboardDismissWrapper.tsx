/**
 * KeyboardDismissWrapper — tapping outside any input dismisses the keyboard.
 *
 * Wrap any screen or form section with this component to get tap-outside-to-dismiss
 * without interfering with child touchables (uses `accessible={false}`).
 *
 * Usage:
 *   <KeyboardDismissWrapper style={styles.container}>
 *     <NativeInput ... />
 *     <NativeFormButton ... />
 *   </KeyboardDismissWrapper>
 */

import React from "react";
import {
  Keyboard,
  TouchableWithoutFeedback,
  View,
  type ViewProps,
} from "react-native";

export const KeyboardDismissWrapper: React.FC<ViewProps> = ({
  children,
  style,
  ...rest
}) => (
  <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
    <View style={[{ flex: 1 }, style]} {...rest}>
      {children}
    </View>
  </TouchableWithoutFeedback>
);
