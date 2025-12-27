const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: process.env.NODE_ENV || 'development',
    entry: {
        background: './extension/background.js',
        'content-script': './extension/content-script.js',
        'popup/popup': './extension/popup/popup.js'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
        clean: true
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            }
        ]
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                { from: 'extension/manifest.json', to: 'manifest.json' },
                { from: 'extension/popup/popup.html', to: 'popup/popup.html' },
                { from: 'extension/popup/popup.css', to: 'popup/popup.css' },
                { from: 'extension/icons', to: 'icons', noErrorOnMissing: true },
                { from: 'extension/config.js', to: 'config.js' }
            ]
        })
    ],
    resolve: {
        extensions: ['.js']
    },
    devtool: 'source-map',
    optimization: {
        minimize: process.env.NODE_ENV === 'production'
    }
};
