const CopyWebpackPlugin = require("copy-webpack-plugin");
const path = require("path");

module.exports = {
  entry: "./bootstrap.js",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bootstrap.js",
  },
  mode: "development",
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: "index.html",
        },
        {
          from: "public",
        },
        {
          from: "node_modules/bootstrap/dist/css/bootstrap.min.css{,.map}",
          to: "vendor/bootstrap/css/[name][ext]",
        },
        {
          from: "node_modules/bootstrap/dist/js/bootstrap.bundle.min.js{,.map}",
          to: "vendor/bootstrap/js/[name][ext]",
        },
      ],
    }),
  ],
  experiments: {
    syncWebAssembly: true,
  },
};
