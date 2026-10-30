// Metro по умолчанию видит только файлы внутри mobile/.
// Добавляем ../shared — общие типы и утилиты с CRM.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../shared')];

module.exports = config;
