// Lets the web preview load expo-sqlite's WebAssembly file (saving is SQLite). No effect on the phone build.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('wasm');

module.exports = config;
