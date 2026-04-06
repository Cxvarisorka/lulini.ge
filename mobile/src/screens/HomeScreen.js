import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Animated,
  Easing,
  Linking,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth } from '../context/AuthContext';
import { useDrawer } from '../navigation/AppNavigator';
import { radius, spacing, useTypography } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';

// Animated Card Component
const AnimatedCard = ({ children, style, delay = 0, onPress, accessibilityLabel, accessibilityHint, accessibilityRole }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
      friction: 8,
      tension: 100,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 8,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  const animatedStyle = {
    opacity: fadeAnim,
    transform: [
      { translateY: slideAnim },
      { scale: scaleAnim },
    ],
  };

  if (onPress) {
    return (
      <Animated.View style={[animatedStyle, style]}>
        <TouchableOpacity
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={1}
          accessibilityRole={accessibilityRole || 'button'}
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
        >
          {children}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>;
};

export default function HomeScreen({ navigation }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { openDrawer } = useDrawer();
  const insets = useSafeAreaInsets();
  const typography = useTypography();

  const carFloatAnim = useRef(new Animated.Value(0)).current;

  // Create dynamic styles based on typography
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(typography, colors), [typography, colors]);

  // M4: Stop animation on unmount to avoid memory leak
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(carFloatAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(carFloatAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const carTranslateY = carFloatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });

  const quickActions = [
    {
      id: 'taxi',
      icon: 'car',
      color: colors.primary,
      label: t('home.callTaxi'),
      screen: 'Taxi',
    },
    {
      id: 'rides',
      icon: 'time',
      color: colors.primary,
      label: t('home.myRides'),
      screen: 'TaxiHistory',
    },
    {
      id: 'payment',
      icon: 'card',
      color: colors.primary,
      label: t('payment.payment'),
      onPress: () => Alert.alert(t('common.comingSoon'), t('payment.comingSoonMessage')),
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + spacing.md,
            paddingBottom: spacing.xl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome Section */}
        <AnimatedCard delay={0}>
          <View style={styles.welcomeSection}>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={openDrawer}
              accessibilityRole="button"
              accessibilityLabel={t('home.openMenu', { defaultValue: 'Open menu' })}
            >
              <Ionicons name="menu" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <View style={styles.welcomeContent}>
              <Text style={styles.greeting} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {t('home.greeting')}, {user?.firstName || t('home.guest')}
              </Text>
              <Text style={styles.subGreeting} numberOfLines={1}>{t('home.whereToGo')}</Text>
            </View>
            <TouchableOpacity
              style={styles.avatarButton}
              onPress={() => navigation.navigate('Profile')}
              accessibilityRole="button"
              accessibilityLabel={t('tabs.profile')}
            >
              {user?.avatar ? (
                <Image source={{ uri: user.avatar }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={20} color={colors.primaryForeground} />
                </View>
              )}
            </TouchableOpacity>
          </View>
        </AnimatedCard>

        {/* Main CTA Card with 3D Shadow */}
        <View style={styles.section}>
          <AnimatedCard
            delay={100}
            onPress={() => navigation.navigate('Taxi')}
            accessibilityLabel={t('home.bookTaxi')}
            accessibilityHint={t('home.taxiSubtitle')}
          >
            <LinearGradient
              colors={['#5b21b6', '#1a1a1a']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaCard}
            >
              <View style={styles.ctaContent}>
                <View style={styles.ctaIconBadge}>
                  <Ionicons name="car-sport" size={20} color={colors.primaryForeground} />
                </View>
                <Text style={styles.ctaTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {t('home.bookTaxi')}
                </Text>
                <Text style={styles.ctaSubtitle} numberOfLines={2}>
                  {t('home.taxiSubtitle')}
                </Text>
                <View style={styles.ctaButton}>
                  <Text style={styles.ctaButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {t('home.requestRide')}
                  </Text>
                  <Ionicons name="arrow-forward" size={16} color={colors.primaryForeground} />
                </View>
              </View>

              {/* Animated Car Image */}
              <Animated.View
                style={[
                  styles.ctaCarImage,
                  { transform: [{ translateY: carTranslateY }] }
                ]}
              >
                <Ionicons name="car-sport" size={120} color="rgba(255,255,255,0.15)" />
              </Animated.View>

              {/* Decorative circles */}
              <View style={styles.ctaCircle1} />
              <View style={styles.ctaCircle2} />
            </LinearGradient>
          </AnimatedCard>
        </View>

        {/* Quick Actions with 3D Cards */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle} numberOfLines={1}>{t('home.quickActions')}</Text>
          <View style={styles.quickActionsGrid}>
            {quickActions.map((action, index) => (
              <AnimatedCard
                key={action.id}
                style={styles.quickActionCard}
                delay={200 + index * 50}
                onPress={() => action.onPress ? action.onPress() : navigation.navigate(action.screen)}
                accessibilityLabel={action.label}
              >
                <View style={styles.quickActionInner}>
                  <View style={[styles.quickActionIcon, { backgroundColor: `${action.color}20` }]}>
                    <Ionicons name={action.icon} size={22} color={action.color} />
                  </View>
                  <Text style={styles.quickActionLabel} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {action.label}
                  </Text>
                </View>
              </AnimatedCard>
            ))}
          </View>
        </View>


        {/* Help Center */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle} numberOfLines={1}>{t('drawer.helpCenter')}</Text>

          <AnimatedCard
            delay={350}
            onPress={() => navigation.navigate('Support')}
            accessibilityLabel={t('drawer.helpCenter')}
            accessibilityHint={t('support.available247')}
          >
            <View style={styles.supportCard}>
              <View style={styles.supportIcon}>
                <Ionicons name="help-buoy" size={20} color={colors.info} />
              </View>
              <View style={styles.supportContent}>
                <Text style={styles.supportTitle} numberOfLines={1}>{t('drawer.helpCenter')}</Text>
                <Text style={styles.supportSubtitle} numberOfLines={1}>{t('support.available247')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
            </View>
          </AnimatedCard>
        </View>

        {/* Follow Us */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle} numberOfLines={1}>{t('home.followUs')}</Text>

          <AnimatedCard
            delay={400}
            onPress={() => Linking.openURL('https://www.facebook.com/profile.php?id=61577178682828')}
            accessibilityLabel="Facebook — Lulini Taxi"
            accessibilityRole="link"
          >
            <View style={styles.socialLinkCard}>
              <View style={[styles.socialLinkIcon, { backgroundColor: '#1877F220' }]}>
                <Ionicons name="logo-facebook" size={22} color="#1877F2" />
              </View>
              <View style={styles.supportContent}>
                <Text style={styles.supportTitle} numberOfLines={1}>Facebook</Text>
                <Text style={styles.supportSubtitle} numberOfLines={1}>Lulini Taxi</Text>
              </View>
              <Ionicons name="open-outline" size={18} color={colors.mutedForeground} />
            </View>
          </AnimatedCard>

          <AnimatedCard
            delay={450}
            onPress={() => Linking.openURL('https://www.instagram.com/lulinitaxi/')}
            accessibilityLabel="Instagram — @lulinitaxi"
            accessibilityRole="link"
          >
            <View style={styles.socialLinkCard}>
              <View style={[styles.socialLinkIcon, { backgroundColor: '#E440A220' }]}>
                <Ionicons name="logo-instagram" size={22} color="#E4405F" />
              </View>
              <View style={styles.supportContent}>
                <Text style={styles.supportTitle} numberOfLines={1}>Instagram</Text>
                <Text style={styles.supportSubtitle} numberOfLines={1}>@lulinitaxi</Text>
              </View>
              <Ionicons name="open-outline" size={18} color={colors.mutedForeground} />
            </View>
          </AnimatedCard>
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
  },
  welcomeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  welcomeContent: {
    flex: 1,
  },
  greeting: {
    ...typography.display,
    color: colors.foreground,
    marginBottom: 2,
  },
  subGreeting: {
    ...typography.caption,
    color: colors.mutedForeground,
  },
  avatarButton: {
    marginLeft: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.mutedForeground,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  ctaCard: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 180,
    shadowColor: '#5b21b6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  ctaContent: {
    zIndex: 2,
  },
  ctaIconBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  ctaTitle: {
    ...typography.h1,
    color: colors.primaryForeground,
    marginBottom: 4,
  },
  ctaSubtitle: {
    ...typography.captionSmall,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: spacing.lg,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  ctaButtonText: {
    ...typography.button,
    color: colors.primaryForeground,
  },
  ctaCarImage: {
    position: 'absolute',
    right: -20,
    bottom: 20,
    zIndex: 1,
  },
  ctaCircle1: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.05)',
    top: -50,
    right: -50,
  },
  ctaCircle2: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.03)',
    bottom: -30,
    left: -30,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickActionCard: {
    flex: 1,
  },
  quickActionInner: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionLabel: {
    ...typography.caption,
    fontWeight: '500',
    color: colors.foreground,
    textAlign: 'center',
  },
  supportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  socialLinkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  socialLinkIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  supportIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  supportContent: {
    flex: 1,
  },
  supportTitle: {
    ...typography.bodyMedium,
    color: colors.foreground,
  },
  supportSubtitle: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    marginTop: 2,
  },
});
