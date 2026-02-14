import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMap } from '../context/MapContext';
import { colors, shadows, radius, useTypography } from '../theme/colors';

export default function MapSelectScreen({ navigation }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { currentMap, changeMap, maps } = useMap();
  const typography = useTypography();
  const styles = useMemo(() => createStyles(typography), [typography]);

  const handleMapSelect = async (mapCode) => {
    await changeMap(mapCode);
    navigation.goBack();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('settings.mapProvider')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.description}>{t('settings.mapProviderDescription')}</Text>

        {maps.map((map) => (
          <TouchableOpacity
            key={map.code}
            style={[
              styles.mapItem,
              currentMap === map.code && styles.mapItemActive,
            ]}
            onPress={() => handleMapSelect(map.code)}
          >
            <View style={styles.mapInfo}>
              <View style={styles.mapIconContainer}>
                <Ionicons name={map.icon} size={24} color={colors.foreground} />
              </View>
              <Text style={styles.mapName}>{map.nameKey ? t(map.nameKey) : map.name}</Text>
            </View>
            {currentMap === map.code && (
              <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const createStyles = (typography) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  title: {
    ...typography.h2,
    color: colors.foreground,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  description: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginBottom: 20,
  },
  mapItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 12,
    ...shadows.sm,
  },
  mapItemActive: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  mapInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mapIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  mapName: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
  },
});
