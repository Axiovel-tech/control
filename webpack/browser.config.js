// Webpack configuration for dynamic bundling
// and serving to browsers during development

const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const webpack = require('webpack');
const { merge } = require('webpack-merge');

const baseConfig = require('./base.config.js');
const {
  htmlMetaTags,
  projectRoot,
  useHotModuleReloading,
} = require('./helpers');

const optimization = {};
const plugins = [
  // process and Buffer polyfills are needed for AFrame to work nicely as of
  // 1.1.0
  new webpack.ProvidePlugin({
    Buffer: ['buffer', 'Buffer'],
    process: require.resolve('process/browser'),
  }),

  // Create index.html on-the-fly
  new HtmlWebpackPlugin({
    favicon: path.resolve(projectRoot, 'assets', 'icons', 'favicon.ico'),
    meta: htmlMetaTags,
    template: path.resolve(projectRoot, 'index.html'),
    title:
      'Skybrush Live | The Next-generation Drone Light Show Software Suite',
  }),
];

if (useHotModuleReloading) {
  plugins.push(
    new ReactRefreshWebpackPlugin({
      // The refresh overlay is a fixed, full-viewport iframe at the maximum
      // z-index, and it is mounted whether or not there is an error to show.
      // It therefore swallows every pointer event aimed at the app, which no
      // amount of retrying gets past. Compile and runtime errors still reach
      // the console and the harness-captured webpack log.
      overlay: process.env.AXIO_E2E === '1' ? false : undefined,
    })
  );

  optimization.runtimeChunk = 'single'; // hot module reloading needs this
}

module.exports = merge(baseConfig, {
  entry: {
    app: './src/index',
  },
  resolve: {
    alias: {
      // These are needed for WorkerUrlPlugin to work correctly, but only in the
      // browser context
      child_process: false,
      worker_threads: false,
    },
  },
  optimization,
  plugins,
});
