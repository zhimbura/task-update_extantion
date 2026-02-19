const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const pkg = require('./package.json');

module.exports = {
  entry: {
    popup: './popup.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true
  },
  resolve: {
    fallback: {
      "crypto": false,
      "stream": false,
      "util": false,
      "buffer": false,
      "process": false,
      "fs": false,
      "path": false,
      "os": false
    }
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'manifest.json',
          to: 'manifest.json',
          transform: (content) => {
            const manifest = JSON.parse(content.toString());
            manifest.version = pkg.version;
            return JSON.stringify(manifest, null, 2);
          }
        },
        { from: 'popup.html', to: 'popup.html' },
        { from: 'styles.css', to: 'styles.css' },
        { from: '*.png', to: '[name][ext]' }
      ]
    })
  ],
  mode: 'production',
  // Отключаем минификацию для отладки (можно включить позже)
  optimization: {
    minimize: false
  }
};
