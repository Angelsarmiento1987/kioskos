const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const keys = [
  "FIREBASE_API_KEY",
  "FIREBASE_AUTH_DOMAIN",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_APP_ID",
  "FIREBASE_MESSAGING_SENDER_ID",
  "FIREBASE_STORAGE_BUCKET",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_UPLOAD_PRESET",
  "USE_EMULATORS",
  "PUBLIC_APP_URL",
  "PLAY_STORE_URL",
];
module.exports = (_, argv) => ({
  entry: "./src/main.jsx",
  output: {
    path: path.resolve(__dirname, "build"),
    filename: "static/[name].[contenthash:8].js",
    publicPath: "auto",
    clean: true,
  },
  resolve: { extensions: [".jsx", ".js", ".mjs"] },
  module: {
    rules: [
      {
        test: /\.[jm]sx?$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: [["@babel/preset-react", { runtime: "automatic" }]],
          },
        },
      },
      { test: /\.css$/, use: ["style-loader", "css-loader"] },
      { test: /\.(svg|png|webp|woff2)$/, type: "asset/resource" },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({ template: "public/index.html" }),
    new HtmlWebpackPlugin({
      template: "public/index.html",
      filename: "superadmin/index.html",
    }),
    new webpack.DefinePlugin(
      Object.fromEntries(
        keys.map((k) => [
          "process.env.REACT_APP_" + k,
          JSON.stringify(process.env["REACT_APP_" + k] || ""),
        ]),
      ),
    ),
  ],
  optimization: { splitChunks: { chunks: "all" } },
  performance: { maxEntrypointSize: 1300000, maxAssetSize: 1000000 },
  devtool: argv.mode === "production" ? false : "eval-cheap-module-source-map",
  devServer: {
    host: "localhost",
    port: 3000,
    historyApiFallback: true,
    allowedHosts: ["localhost", "127.0.0.1", "terminal.local"],
    client: { overlay: true },
    hot: true,
  },
});
