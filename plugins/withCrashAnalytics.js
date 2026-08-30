const { createRunOncePlugin, withAppBuildGradle, withProjectBuildGradle } = require("expo/config-plugins");

const GOOGLE_SERVICES_CLASSPATH = "classpath('com.google.gms:google-services:4.5.0')";
const CRASHLYTICS_CLASSPATH = "classpath('com.google.firebase:firebase-crashlytics-gradle:3.0.8')";
const GOOGLE_SERVICES_PLUGIN = 'apply plugin: "com.google.gms.google-services"';
const CRASHLYTICS_PLUGIN = 'apply plugin: "com.google.firebase.crashlytics"';
const FIREBASE_DEPENDENCIES = `    implementation(platform("com.google.firebase:firebase-bom:34.18.0"))
    implementation("com.google.firebase:firebase-crashlytics")
  implementation("com.google.firebase:firebase-analytics")
  implementation("com.google.firebase:firebase-messaging")`;

const withCrashAnalytics = (config) => {
  config = withProjectBuildGradle(config, (gradleConfig) => {
    if (!gradleConfig.modResults.contents.includes(GOOGLE_SERVICES_CLASSPATH)) {
      gradleConfig.modResults.contents = gradleConfig.modResults.contents.replace(
        "    classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')",
        `    classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')\n    ${GOOGLE_SERVICES_CLASSPATH}`,
      );
    }

    if (!gradleConfig.modResults.contents.includes(CRASHLYTICS_CLASSPATH)) {
      gradleConfig.modResults.contents = gradleConfig.modResults.contents.replace(
        GOOGLE_SERVICES_CLASSPATH,
        `${GOOGLE_SERVICES_CLASSPATH}\n    ${CRASHLYTICS_CLASSPATH}`,
      );
    }
    return gradleConfig;
  });

  return withAppBuildGradle(config, (gradleConfig) => {
    let { contents } = gradleConfig.modResults;

    if (!contents.includes(GOOGLE_SERVICES_PLUGIN)) {
      contents = contents.replace(
        'apply plugin: "com.facebook.react"',
        `apply plugin: "com.facebook.react"\n${GOOGLE_SERVICES_PLUGIN}`,
      );
    }

    if (!contents.includes(CRASHLYTICS_PLUGIN)) {
      contents = contents.replace(
        GOOGLE_SERVICES_PLUGIN,
        `${GOOGLE_SERVICES_PLUGIN}\n${CRASHLYTICS_PLUGIN}`,
      );
    }

    if (!contents.includes('com.google.firebase:firebase-bom:34.18.0')) {
      contents = contents.replace("dependencies {", `dependencies {\n${FIREBASE_DEPENDENCIES}`);
    }

    gradleConfig.modResults.contents = contents;
    return gradleConfig;
  });
};

module.exports = createRunOncePlugin(withCrashAnalytics, "withCrashAnalytics", "1.0.0");