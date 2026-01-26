const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    content: './content.js',
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
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'popup.html', to: 'popup.html' },
        { from: 'styles.css', to: 'styles.css' },
        { from: 'sheets-api.js', to: 'sheets-api.js' },
        { from: 'background.js', to: 'background.js' },
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
