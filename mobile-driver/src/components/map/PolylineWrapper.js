/**
 * PolylineWrapper
 *
 * Thin wrapper around react-native-maps Polyline.
 */
const { Polyline } = require('react-native-maps');

export default function PolylineWrapper({ id, ...props }) {
  return <Polyline {...props} />;
}
