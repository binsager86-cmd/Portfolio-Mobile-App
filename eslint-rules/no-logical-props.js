module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce logical props (start/end) over physical (left/right)",
    },
    schema: [],
  },
  create(context) {
    return {
      Property(node) {
        if (!node.key || node.key.type !== "Identifier") return;
        const bad = [
          "paddingLeft",
          "paddingRight",
          "marginLeft",
          "marginRight",
          "borderLeftWidth",
          "borderRightWidth",
        ];
        if (bad.includes(node.key.name)) {
          const logicalName = node.key.name
            .replace(/Left/g, "Start")
            .replace(/Right/g, "End");
          context.report({
            node,
            message: `Use '${logicalName}' for RTL support.`,
          });
        }
      },
    };
  },
};
