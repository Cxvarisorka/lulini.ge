import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, shadows, radius, spacing, useTypography } from '../theme/colors';

export default function SupportScreen({ navigation }) {
const typography = useTypography();
  const styles = React.useMemo(() => createStyles(typography), [typography]);
    const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const faqItems = [
    {
      icon: 'car',
      question: t('support.faq.howToBook'),
      answer: t('support.faq.howToBookAnswer'),
    },
    {
      icon: 'card',
      question: t('support.faq.paymentMethods'),
      answer: t('support.faq.paymentMethodsAnswer'),
    },
    {
      icon: 'close-circle',
      question: t('support.faq.cancelRide'),
      answer: t('support.faq.cancelRideAnswer'),
    },
    {
      icon: 'pricetag',
      question: t('support.faq.pricing'),
      answer: t('support.faq.pricingAnswer'),
    },
    {
      icon: 'shield-checkmark',
      question: t('support.faq.safety'),
      answer: t('support.faq.safetyAnswer'),
    },
  ];

  const safeLinkOpen = (url) => {
    Linking.openURL(url).catch(() => {
      Alert.alert(t('errors.error'), t('errors.cannotOpenLink', { defaultValue: 'Could not open this link on your device.' }));
    });
  };

  const contactOptions = [
    {
      icon: 'call',
      label: t('support.callUs'),
      subtitle: '+995 555 123 456',
      color: colors.success,
      onPress: () => safeLinkOpen('tel:+995555123456'),
    },
    {
      icon: 'chatbubble',
      label: t('support.liveChat'),
      subtitle: t('common.comingSoon', { defaultValue: 'Coming Soon' }),
      color: colors.info,
      onPress: () => Alert.alert(t('common.comingSoon', { defaultValue: 'Coming Soon' }), t('common.comingSoonDesc', { defaultValue: 'This feature is not available yet.' })),
    },
    {
      icon: 'mail',
      label: t('support.emailUs'),
      subtitle: 'support@lulini.ge',
      color: colors.warning,
      onPress: () => safeLinkOpen('mailto:support@lulini.ge'),
    },
  ];

  const handleFAQPress = (item) => {
    navigation.navigate('FAQDetail', { question: item.question, answer: item.answer });
  };

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
        {/* Quick Contact */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('support.contactUs')}</Text>
          <View style={styles.contactGrid}>
            {contactOptions.map((option, index) => (
              <TouchableOpacity
                key={index}
                style={styles.contactCard}
                onPress={option.onPress}
              >
                <View
                  style={[styles.contactIcon, { backgroundColor: `${option.color}15` }]}
                >
                  <Ionicons name={option.icon} size={24} color={option.color} />
                </View>
                <Text style={styles.contactLabel}>{option.label}</Text>
                <Text style={styles.contactSubtitle}>{option.subtitle}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* FAQ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('support.frequentlyAsked')}</Text>
          <View style={styles.faqContainer}>
            {faqItems.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.faqItem,
                  index !== faqItems.length - 1 && styles.faqItemBorder,
                ]}
                onPress={() => handleFAQPress(item)}
              >
                <View style={styles.faqIcon}>
                  <Ionicons name={item.icon} size={20} color={colors.foreground} />
                </View>
                <Text style={styles.faqQuestion}>{item.question}</Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Report Issue */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('support.reportIssue')}</Text>
          <TouchableOpacity
            style={styles.reportCard}
            onPress={() => Alert.alert(t('support.reportIssue'), t('support.reportDescription'))}
          >
            <View style={styles.reportContent}>
              <Ionicons name="warning" size={28} color={colors.warning} />
              <View style={styles.reportText}>
                <Text style={styles.reportTitle}>{t('support.haveProblem')}</Text>
                <Text style={styles.reportSubtitle}>
                  {t('support.reportDescription')}
                </Text>
              </View>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>
        </View>

        {/* Support History */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.historyLink}
            onPress={() => navigation.navigate('SupportHistory')}
          >
            <View style={styles.historyIcon}>
              <Ionicons name="time" size={22} color={colors.foreground} />
            </View>
            <View style={styles.historyContent}>
              <Text style={styles.historyText}>{t('support.viewHistory')}</Text>
              <Text style={styles.historySubtext}>
                {t('support.viewHistoryDesc')}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>
        </View>

        {/* Emergency */}
        <View style={styles.emergencyCard}>
          <Ionicons name="alert-circle" size={24} color={colors.destructive} />
          <View style={styles.emergencyContent}>
            <Text style={styles.emergencyTitle}>{t('support.emergency')}</Text>
            <Text style={styles.emergencyText}>
              {t('support.emergencyDesc')}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.emergencyButton}
            onPress={() => Linking.openURL('tel:112')}
          >
            <Text style={styles.emergencyButtonText}>112</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (typography) => StyleSheet.create({
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
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.label,
    fontWeight: '600',
    color: colors.mutedForeground,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  contactGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  contactCard: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginHorizontal: spacing.xs,
    ...shadows.sm,
  },
  contactIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  contactLabel: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
    textAlign: 'center',
  },
  contactSubtitle: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: 2,
  },
  faqContainer: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    ...shadows.sm,
  },
  faqItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  faqItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  faqIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  faqQuestion: {
    flex: 1,
    ...typography.h3,
    fontWeight: '500',
    color: colors.foreground,
  },
  reportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.sm,
  },
  reportContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  reportText: {
    marginLeft: spacing.md,
  },
  reportTitle: {
    ...typography.h3,
    color: colors.foreground,
  },
  reportSubtitle: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.sm,
  },
  historyIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  historyContent: {
    flex: 1,
  },
  historyText: {
    ...typography.h3,
    fontWeight: '500',
    color: colors.foreground,
  },
  historySubtext: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  emergencyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.destructive}10`,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: `${colors.destructive}30`,
    marginBottom: spacing.xl,
  },
  emergencyContent: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  emergencyTitle: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.destructive,
  },
  emergencyText: {
    ...typography.caption,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  emergencyButton: {
    backgroundColor: colors.destructive,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  emergencyButtonText: {
    ...typography.h2,
    fontWeight: '700',
    color: colors.primaryForeground,
  },
});
