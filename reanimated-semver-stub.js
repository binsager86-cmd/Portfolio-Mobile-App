/**
 * Stub for react-native-reanimated validate-worklets-version and semver functions.
 * On web bundle, we don't need actual worklet validation, so return dummy implementations.
 */

// Stub for validate-worklets-version.js default export
// Must return an object with { ok: boolean, message?: string }
const validateWorkletsVersion = (version) => {
  return { ok: true, message: 'Worklet validation skipped on web' };
};

// Stubs for semver functions
const semverSatisfies = () => true;
const semverPrerelease = () => null;
const semverOutside = () => false;

// Support both ES module and CommonJS imports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = validateWorkletsVersion;
  module.exports.default = validateWorkletsVersion;
  module.exports.satisfies = semverSatisfies;
  module.exports.prerelease = semverPrerelease;
  module.exports.outside = semverOutside;
}

export default validateWorkletsVersion;
export { semverSatisfies, semverPrerelease, semverOutside };
