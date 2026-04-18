import { registerRootComponent } from 'expo';
import Constants from 'expo-constants';
import Mapbox from '@rnmapbox/maps';

import App from './App';

const MAPBOX_TOKEN =
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN ??
  Constants.expoConfig?.extra?.mapboxToken ??
  null;

if (MAPBOX_TOKEN) {
  Mapbox.setAccessToken(MAPBOX_TOKEN);
}
if (typeof Mapbox.setTelemetryEnabled === 'function') {
  Mapbox.setTelemetryEnabled(false);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
