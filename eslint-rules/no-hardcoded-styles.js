const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const SPACING_PROPS = new Set([
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "gap",
  "paddingHorizontal",
  "paddingVertical",
  "marginHorizontal",
  "marginVertical",
]);

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce design token usage over hardcoded styles",
      recommended: true,
    },
    fixable: null,
    schema: [],
  },
  create(context) {
    const filename = context.getFilename ? context.getFilename() : "";
    if (filename.includes("/theme/tokens.ts") || filename.includes("\\theme\\tokens.ts")) {
      return {};
    }

    return {
      Property(node) {
        if (!node.key || node.key.type !== "Identifier") return;
        const propName = node.key.name;

        if (
          propName === "color" ||
          propName.endsWith("Color") ||
          propName.endsWith("TintColor")
        ) {
          if (
            node.value &&
            node.value.type === "Literal" &&
            typeof node.value.value === "string" &&
            HEX_COLOR_REGEX.test(node.value.value)
          ) {
            context.report({
              node,
              message: `Hardcoded color '${node.value.value}'. Use tokens.colors.* instead.`,
            });
          }
        }

        if (SPACING_PROPS.has(propName)) {
          if (
            node.value &&
            node.value.type === "Literal" &&
            typeof node.value.value === "number" &&
            node.value.value > 0
          ) {
            context.report({
              node,
              message: `Hardcoded spacing '${node.value.value}'. Use tokens.spacing.* instead.`,
            });
          }
        }

        if (propName === "fontSize" || propName === "lineHeight") {
          if (
            node.value &&
            node.value.type === "Literal" &&
            typeof node.value.value === "number"
          ) {
            context.report({
              node,
              message: `Hardcoded typography '${propName}: ${node.value.value}'. Use tokens.typography.* instead.`,
            });
          }
        }
      },
    };
  },
};