/**
 * PolylineWrapper
 *
 * Thin wrapper around react-native-maps Polyline.
 */
const { Polyline } = require('react-native-maps');

export default function PolylineWrapper(props) {
  return <Polyline {...props} />;
}
