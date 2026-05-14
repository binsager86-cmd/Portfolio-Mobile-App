// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const exclusionList = require("metro-config/src/defaults/exclusionList");
const path = require("path");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Optimize JS transformer for production builds
// Metro uses metro-minify-terser by default — just pass config through.
config.transformer.minifierConfig = {
  compress: { drop_console: true, drop_debugger: true },
  mangle: { toplevel: true },
};

// Enable package.json "exports" field resolution (needed by jspdf and others)
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = [
  "react-native",
  "browser",
  "require",
  "default",
];

// Ignore transient Android build artifacts created by react-native-nitro-modules.
// On Windows/OneDrive these folders can disappear while Metro attaches watchers,
// which raises ENOENT and crashes the dev server.
config.resolver.blockList = exclusionList([
  /.*[\\/]node_modules[\\/]\.react-native-nitro-modules-[^\\/]+[\\/]android[\\/]build(?:[\\/].*)?$/,
]);

// Force jspdf to always resolve to its browser (ES) build,
// even inside the SSR / node render bundle where Metro would
// otherwise pick the "node" export which contains AMD require()
// calls that Metro cannot transform.
const origResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "jspdf") {
    return {
      type: "sourceFile",
      filePath: path.resolve(
        __dirname,
        "node_modules",
        "jspdf",
        "dist",
        "jspdf.es.min.js",
      ),
    };
  }
  if (origResolveRequest) {
    return origResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
