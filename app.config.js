const appJson = require("./app.json");

const expo = appJson.expo || {};
const configuredWeb = expo.web || {};

// Default to SPA output for local dev; allow override for static export builds.
const webOutput = process.env.EXPO_WEB_OUTPUT || "single";

module.exports = {
  ...expo,
  web: {
    ...configuredWeb,
    output: webOutput,
  },
};
