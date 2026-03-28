import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Platform,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';
import { shadows, radius, spacing, useTypography } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';

export default function AboutScreen({ navigation }) {
const typography = useTypography();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(typography, colors), [typography, colors]);
    const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // L7: Use app config version instead of hardcoded
  const appInfo = {
    version: Constants.expoConfig?.version || '1.0.0',
    buildNumber: Constants.expoConfig?.extra?.buildNumber || Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode?.toString() || '100',
  };

  const links = [
    {
      icon: 'globe',
      label: t('about.website'),
      url: 'https://lulini.ge',
    },
    {
      icon: 'logo-facebook',
      label: 'Facebook',
      url: 'https://facebook.com/lulinitaxi',
    },
    {
      icon: 'logo-instagram',
      label: 'Instagram',
      url: 'https://instagram.com/lulinitaxi',
    },
    {
      icon: 'logo-twitter',
      label: 'Twitter',
      url: 'https://twitter.com/lulinitaxi',
    },
  ];

  const legalLinks = [
    {
      icon: 'document-text',
      label: t('about.termsOfService'),
      onPress: () => handleLinkPress('https://lulini.ge/terms'),
    },
    {
      icon: 'shield-checkmark',
      label: t('about.privacyPolicy'),
      onPress: () => handleLinkPress('https://lulini.ge/privacy'),
    },
    {
      icon: 'document',
      label: t('about.licenses'),
      onPress: () => handleLinkPress('https://lulini.ge/licenses'),
    },
  ];

  // L4: Wrap in try/catch for error handling
  const handleLinkPress = async (url) => {
    try {
      await Linking.openURL(url);
    } catch (err) {
      if (__DEV__) console.warn('[About] Failed to open URL:', err.message);
    }
  };

  const handleRateApp = async () => {
    // Try expo-store-review first (graceful degradation if not installed)
    try {
      const StoreReview = require('expo-store-review');
      const isAvailable = await StoreReview.isAvailableAsync();
      if (isAvailable) {
        await StoreReview.requestReview();
        return;
      }
    } catch (_) {
      // expo-store-review not installed — fall through to Linking
    }
    // Fallback: open the store listing directly
    const storeUrl =
      Platform.OS === 'ios'
        ? 'https://apps.apple.com/app/lulini/id0000000000' // replace with real App Store ID
        : 'market://details?id=ge.lulini.passenger';
    handleLinkPress(storeUrl);
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
        {/* App Logo & Info */}
        <View style={styles.appHeader}>
          <View style={styles.logoContainer}>
            <Ionicons name="car-sport" size={48} color={colors.primary} />
          </View>
          <Text style={styles.appName}>Lulini</Text>
          <Text style={styles.appTagline}>{t('about.tagline')}</Text>
          <View style={styles.versionContainer}>
            <Text style={styles.versionText}>
              {t('about.version')} {appInfo.version}
            </Text>
            <Text style={styles.buildText}>
              ({t('about.build')} {appInfo.buildNumber})
            </Text>
          </View>
        </View>

        {/* About Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('about.aboutUs')}</Text>
          <View style={styles.descriptionCard}>
            <Text style={styles.descriptionText}>
              {t('about.description')}
            </Text>
          </View>
        </View>

        {/* Social Links */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('about.followUs')}</Text>
          <View style={styles.linksContainer}>
            {links.map((link, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.linkItem,
                  index !== links.length - 1 && styles.linkItemBorder,
                ]}
                onPress={() => handleLinkPress(link.url)}
                accessibilityRole="link"
                accessibilityLabel={link.label}
                accessibilityHint={t('about.opensInBrowser', { defaultValue: 'Opens in browser' })}
              >
                <View style={styles.linkIcon}>
                  <Ionicons name={link.icon} size={22} color={colors.foreground} />
                </View>
                <Text style={styles.linkLabel}>{link.label}</Text>
                <Ionicons
                  name="open-outline"
                  size={18}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Legal Links */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('about.legal')}</Text>
          <View style={styles.linksContainer}>
            {legalLinks.map((link, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.linkItem,
                  index !== legalLinks.length - 1 && styles.linkItemBorder,
                ]}
                onPress={link.onPress}
                accessibilityRole="link"
                accessibilityLabel={link.label}
                accessibilityHint={t('about.opensInBrowser', { defaultValue: 'Opens in browser' })}
              >
                <View style={styles.linkIcon}>
                  <Ionicons name={link.icon} size={22} color={colors.foreground} />
                </View>
                <Text style={styles.linkLabel}>{link.label}</Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Rate App */}
        <TouchableOpacity
          style={styles.rateCard}
          onPress={handleRateApp}
          accessibilityRole="button"
          accessibilityLabel={t('about.rateApp')}
          accessibilityHint={t('about.rateAppDesc')}
        >
          <View style={styles.rateContent}>
            <Ionicons name="star" size={28} color={colors.warning} />
            <View style={styles.rateText}>
              <Text style={styles.rateTitle}>{t('about.rateApp')}</Text>
              <Text style={styles.rateSubtitle}>{t('about.rateAppDesc')}</Text>
            </View>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={colors.mutedForeground}
          />
        </TouchableOpacity>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            © 2026 Lulini. {t('about.allRightsReserved')}
          </Text>
          <Text style={styles.footerSubtext}>
            {t('about.madeWithLove')} 🇬🇪
          </Text>
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
  appHeader: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
  },
  logoContainer: {
    width: 96,
    height: 96,
    borderRadius: radius['2xl'],
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  appName: {
    ...typography.display,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  appTagline: {
    ...typography.h3,
    fontWeight: '400',
    color: colors.mutedForeground,
    marginBottom: spacing.md,
  },
  versionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  versionText: {
    ...typography.bodyMedium,
    color: colors.foreground,
  },
  buildText: {
    ...typography.body,
    color: colors.mutedForeground,
    marginLeft: spacing.xs,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  descriptionCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.sm,
  },
  descriptionText: {
    ...typography.h3,
    fontWeight: '400',
    color: colors.foreground,
    lineHeight: 24,
  },
  linksContainer: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    ...shadows.sm,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  linkItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  linkLabel: {
    flex: 1,
    ...typography.h3,
    fontWeight: '500',
    color: colors.foreground,
  },
  rateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    ...shadows.sm,
  },
  rateContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rateText: {
    marginLeft: spacing.md,
  },
  rateTitle: {
    ...typography.h2,
    color: colors.foreground,
  },
  rateSubtitle: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
  },
  footerText: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
  },
  footerSubtext: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
  },
});
