declare module "@expo/vector-icons" {
  import type { ComponentType } from "react";
  import type { TextProps } from "react-native";

  export type IconProps = TextProps & {
    name: string;
    size?: number;
    color?: string;
  };

  export const FontAwesome: ComponentType<IconProps> & { font?: Record<string, unknown> };
}

declare module "@expo/vector-icons/FontAwesome" {
  import type { ComponentType } from "react";
  import type { IconProps } from "@expo/vector-icons";

  const FontAwesome: ComponentType<IconProps> & { font?: Record<string, unknown> };
  export default FontAwesome;
}

declare module "jspdf" {
  export class jsPDF {
    constructor(...args: unknown[]);
    [key: string]: any;
  }
}

declare module "expo-file-system" {
  export const documentDirectory: string | null;
  export const EncodingType: { Base64: string };
  export function writeAsStringAsync(
    fileUri: string,
    contents: string,
    options?: { encoding?: string }
  ): Promise<void>;
}
