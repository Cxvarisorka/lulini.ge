import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { showCrisp } from '../services/crisp';
import { colors, shadows, radius, spacing, useTypography } from '../theme/colors';

export default function SupportHistoryScreen({ navigation }) {
  const typography = useTypography();
  const styles = React.useMemo(() => createStyles(typography), [typography]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // Open Crisp chat automatically when this screen mounts
  useEffect(() => {
    showCrisp();
  }, []);

  return (
    <View style={styles.container}>
      <View style={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.iconContainer}>
          <Ionicons name="chatbubbles" size={48} color={colors.primary} />
        </View>
        <Text style={styles.title}>
          {t('support.liveChatTitle', { defaultValue: 'Live Chat Support' })}
        </Text>
        <Text style={styles.subtitle}>
          {t('support.liveChatDesc', { defaultValue: 'Your conversation history is available in the chat window. Tap below to open it again.' })}
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => showCrisp()}>
          <Ionicons name="chatbubble" size={20} color={colors.primaryForeground} />
          <Text style={styles.buttonText}>
            {t('support.openChat', { defaultValue: 'Open Chat' })}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (typography) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.muted,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: radius.full,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.h1,
    color: colors.foreground,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginBottom: spacing['2xl'],
    lineHeight: 22,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    ...shadows.sm,
  },
  buttonText: {
    ...typography.button,
    color: colors.primaryForeground,
    marginLeft: spacing.sm,
  },
});
