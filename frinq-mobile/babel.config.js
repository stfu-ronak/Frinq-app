module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // Reanimated 4 uses the worklets plugin (replaces the old
  // react-native-reanimated/plugin). MUST be listed last.
  plugins: ['react-native-worklets/plugin'],
};
