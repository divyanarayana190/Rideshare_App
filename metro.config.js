const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

config.resolver = {
  ...config.resolver,
  blockList: [
    ...(Array.isArray(config.resolver?.blockList) ? config.resolver.blockList : []),
    new RegExp(`^${path.resolve(projectRoot, "server")}/.*`),
    new RegExp(`^${path.resolve(projectRoot, "scripts")}/.*`),
    new RegExp(`^${path.resolve(projectRoot, "dist")}/.*`),
  ],
};

module.exports = withNativeWind(config, {
  input: "./global.css",
  forceWriteFileSystem: true,
});
