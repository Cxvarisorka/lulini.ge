import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

function BoltPin({ color, title, caption, icon }) {
  return (
    <View style={styles.wrapper}>
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
    alignItems: 'center',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  },
  caption: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: 'rgba(255,255,255,0.8)',
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
