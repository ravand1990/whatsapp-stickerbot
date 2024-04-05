const path = require("path");
const webpack = require("webpack");

module.exports = {
  mode: "development",
  entry: "./app.ts",
  target: "node",
  stats: { warnings: false },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    symlinks: true,
    extensions: [".ts", ".js"],
  },
  output: {
    filename: "app.js",
    path: path.resolve(__dirname, "dist"),
  },
  plugins: [
    new webpack.IgnorePlugin({
      resourceRegExp: /^\.\/lib-cov\/fluent-ffmpeg$/,
    }),
  ],
};
