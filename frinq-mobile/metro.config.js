const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  // Defers each module's require() body to first actual use instead of
  // evaluating every screen the navigators import at cold-start module load
  // (Community's realtime socket, VibeReport's animation code, etc.) before
  // the Landing screen ever paints. Standard RN cold-start optimization.
  transformer: {
    getTransformOptions: async () => ({
      transform: { inlineRequires: true },
    }),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
