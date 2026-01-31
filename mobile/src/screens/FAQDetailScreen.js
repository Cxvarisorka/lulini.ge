import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, shadows, radius, spacing } from '../theme/colors';

export default function FAQDetailScreen({ route }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { question, answer } = route.params;

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

        {/* Helpful Section */}
        <View style={styles.helpfulSection}>
          <Text style={styles.helpfulTitle}>{t('support.wasHelpful')}</Text>
          <View style={styles.helpfulButtons}>
            <View style={styles.helpfulButton}>
              <Ionicons name="thumbs-up-outline" size={24} color={colors.success} />
              <Text style={styles.helpfulButtonText}>{t('common.yes')}</Text>
            </View>
            <View style={styles.helpfulButton}>
              <Ionicons name="thumbs-down-outline" size={24} color={colors.destructive} />
              <Text style={styles.helpfulButtonText}>{t('common.no')}</Text>
            </View>
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

const styles = StyleSheet.create({
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
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
    textAlign: 'center',
    lineHeight: 26,
  },
  answerCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  answerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  answerText: {
    fontSize: 16,
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
    fontSize: 15,
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
    fontSize: 14,
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
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
  },
  needHelpText: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: 2,
  },
});
