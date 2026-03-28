import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { shadows, radius, spacing, useTypography } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';

export default function FAQDetailScreen({ route }) {
const typography = useTypography();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(typography, colors), [typography, colors]);
    const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { question, answer } = route.params;
  // M12: Track feedback state
  const [feedback, setFeedback] = useState(null);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Question Card */}
        <View style={styles.questionCard}>
          <View style={styles.questionIcon}>
            <Ionicons name="help-circle" size={28} color={colors.primary} />
          </View>
          <Text style={styles.questionText}>{question}</Text>
        </View>

        {/* Answer Card */}
        <View style={styles.answerCard}>
          <Text style={styles.answerLabel}>{t('support.answer')}</Text>
          <Text style={styles.answerText}>{answer}</Text>
        </View>

        {/* Helpful Section — M12: Changed View to TouchableOpacity */}
        <View style={styles.helpfulSection}>
          <Text style={styles.helpfulTitle}>{t('support.wasHelpful')}</Text>
          <View style={styles.helpfulButtons}>
            <TouchableOpacity
              style={[styles.helpfulButton, feedback !== null && feedback !== 'yes' && { opacity: 0.5 }]}
              onPress={() => setFeedback('yes')}
              disabled={feedback !== null}
            >
              <Ionicons name={feedback === 'yes' ? 'thumbs-up' : 'thumbs-up-outline'} size={24} color={colors.success} />
              <Text style={styles.helpfulButtonText}>{t('common.yes')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.helpfulButton, feedback !== null && feedback !== 'no' && { opacity: 0.5 }]}
              onPress={() => setFeedback('no')}
              disabled={feedback !== null}
            >
              <Ionicons name={feedback === 'no' ? 'thumbs-down' : 'thumbs-down-outline'} size={24} color={colors.destructive} />
              <Text style={styles.helpfulButtonText}>{t('common.no')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Still Need Help */}
        <View style={styles.needHelpCard}>
          <Ionicons name="chatbubbles" size={24} color={colors.info} />
          <View style={styles.needHelpContent}>
            <Text style={styles.needHelpTitle}>{t('support.stillNeedHelp')}</Text>
            <Text style={styles.needHelpText}>{t('support.contactSupport')}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (typography, colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.muted,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  questionCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  questionIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: `${colors.primary}10`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  questionText: {
    ...typography.h1,
    color: colors.foreground,
    textAlign: 'center',
  },
  answerCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  answerLabel: {
    ...typography.label,
    fontWeight: '600',
    color: colors.mutedForeground,
    marginBottom: spacing.md,
  },
  answerText: {
    ...typography.h2,
    fontWeight: '400',
    color: colors.foreground,
    lineHeight: 26,
  },
  helpfulSection: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  helpfulTitle: {
    ...typography.h3,
    fontWeight: '500',
    color: colors.foreground,
    marginBottom: spacing.lg,
  },
  helpfulButtons: {
    flexDirection: 'row',
    gap: spacing.xl,
  },
  helpfulButton: {
    alignItems: 'center',
    padding: spacing.md,
  },
  helpfulButtonText: {
    ...typography.body,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
  },
  needHelpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.info}10`,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: `${colors.info}30`,
  },
  needHelpContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  needHelpTitle: {
    ...typography.h3,
    color: colors.foreground,
  },
  needHelpText: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginTop: 2,
  },
});
