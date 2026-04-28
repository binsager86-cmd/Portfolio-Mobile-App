const { AndroidConfig, IOSConfig, withPlugins, createRunOncePlugin } = require("expo/config-plugins");

const withGoogleSignIn = (config) => {
  return withPlugins(config, [
    AndroidConfig.GoogleServices.withClassPath,
    AndroidConfig.GoogleServices.withApplyPlugin,
    AndroidConfig.GoogleServices.withGoogleServicesFile,
    IOSConfig.Google.withGoogle,
    IOSConfig.Google.withGoogleServicesFile,
  ]);
};

module.exports = createRunOncePlugin(withGoogleSignIn, "withGoogleSignInLocal", "1.0.0");
