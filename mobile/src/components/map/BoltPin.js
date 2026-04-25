import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Fixed wrapper frame — gives iOS @rnmapbox MarkerView a deterministic size
// to lay out before first paint. Without this, Text inside the annotation
// can snapshot with zero-measured frames and render invisibly.
const WRAPPER_WIDTH = 128;
const WRAPPER_HEIGHT = 68;

function BoltPin({ color, title, caption, icon }) {
  return (
    <View style={styles.wrapper} collapsable={false}>
      <View style={[styles.bubble, { backgroundColor: color }]}>
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
        <View style={styles.titleRow}>
          {icon ? (
            <Ionicons
              name={icon}
              size={12}
              color="#fff"
              style={styles.icon}
            />
          ) : null}
          <Text style={styles.title}>{title}</Text>
        </View>
      </View>

      <View style={[styles.stem, { backgroundColor: color }]} />

      <View style={[styles.dotOuter, { borderColor: color }]}>
        <View style={[styles.dotInner, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: WRAPPER_WIDTH,
    height: WRAPPER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    minWidth: 64,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    // Android retains its raised look via elevation. iOS layer-shadow is
    // intentionally omitted — it triggered a CALayer z-order bug inside
    // @rnmapbox annotation views that hid the Text children. The white
    // border already provides enough separation from the map.
    elevation: 4,
  },
  caption: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: 'rgba(255,255,255,0.85)',
    textTransform: 'uppercase',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 4,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
  stem: {
    width: 2,
    height: 10,
  },
  dotOuter: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});

export default memo(BoltPin);
