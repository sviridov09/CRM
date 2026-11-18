import { registerRootComponent } from 'expo';

// Переводы — первыми: тексты нужны и фоновым задачам
import './src/i18n';
// Фоновая задача геолокации — до регистрации экрана, на верхнем уровне бандла
import './src/geo/shiftTracking';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
