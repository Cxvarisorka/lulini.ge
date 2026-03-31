import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, radius, shadows, useTypography } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { paymentAPI } from '../services/api';

export default function PaymentSettingsScreen() {
  const typography = useTypography();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(typography, colors, insets), [typography, colors, insets]);
  const { t, i18n } = useTranslation();

  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const fetchCards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await paymentAPI.getSavedCards();
      setCards(res.data?.data?.cards || []);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const handleAddCard = async () => {
    setProcessing(true);
    try {
      const lang = i18n.language === 'ka' ? 'ka' : 'en';
      const res = await paymentAPI.registerCard(lang);
      const { redirectUrl, orderId } = res.data?.data || {};

      if (redirectUrl) {
        await WebBrowser.openAuthSessionAsync(redirectUrl, 'lulini://');

        if (orderId) {
          try {
            const verifyRes = await paymentAPI.verifyCardRegistration(orderId);
            const status = verifyRes.data?.data?.status;
            if (status === 'rejected') {
              Alert.alert(t('errors.error'), t('payment.cardRegistrationFailed'));
            }
          } catch {
            // Non-fatal — card may still be saved via callback
          }
        }

        await fetchCards();
      }
    } catch (err) {
      Alert.alert(
        t('errors.error'),
        err.response?.data?.message || t('errors.somethingWentWrong')
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteCard = (card) => {
    Alert.alert(
      t('payment.removeCard'),
      t('payment.removeCardConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await paymentAPI.deleteCard(card._id);
              setCards(prev => prev.filter(c => c._id !== card._id));
            } catch {
              Alert.alert(t('errors.error'), t('errors.somethingWentWrong'));
            }
          },
        },
      ]
    );
  };

  const handleSetDefault = async (card) => {
    if (card.isDefault) return;
    try {
      await paymentAPI.setDefaultCard(card._id);
      setCards(prev =>
        prev.map(c => ({ ...c, isDefault: c._id === card._id }))
      );
    } catch {
      Alert.alert(t('errors.error'), t('errors.somethingWentWrong'));
    }
  };

  const getCardIcon = (cardType) => {
    switch (cardType) {
      case 'visa': return 'card';
      case 'mc': return 'card';
      case 'amex': return 'card';
      default: return 'card-outline';
    }
  };

  const getCardLabel = (cardType) => {
    switch (cardType) {
      case 'visa': return 'Visa';
      case 'mc': return 'Mastercard';
      case 'amex': return 'Amex';
      default: return 'Card';
    }
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Payment Methods Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('payment.paymentMethods')}</Text>
            <View style={styles.methodCard}>
              <View style={styles.methodRow}>
                <View style={styles.methodIconContainer}>
                  <Ionicons name="cash-outline" size={22} color="#4CAF50" />
                </View>
                <View style={styles.methodInfo}>
                  <Text style={styles.methodTitle}>{t('payment.cash')}</Text>
                  <Text style={styles.methodDesc}>{t('payment.cashAlwaysAvailable')}</Text>
                </View>
                <Ionicons name="checkmark-circle" size={22} color="#4CAF50" />
              </View>
            </View>
          </View>

          {/* Saved Cards Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('payment.savedCardsSection')}</Text>
            {cards.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="card-outline" size={32} color={colors.mutedForeground} />
                </View>
                <Text style={styles.emptyTitle}>{t('payment.noCards')}</Text>
                <Text style={styles.emptyMessage}>{t('payment.noCardsMessage')}</Text>
              </View>
            ) : (
              <>
                <Text style={styles.sectionHint}>{t('payment.tapToSetDefault')}</Text>
                {cards.map((item, index) => (
                  <View key={item._id} style={[styles.cardItem, index > 0 && { marginTop: spacing.md }]}>
                    <TouchableOpacity
                      style={styles.cardMain}
                      onPress={() => handleSetDefault(item)}
                    >
                      <View style={styles.cardIconContainer}>
                        <Ionicons name={getCardIcon(item.cardType)} size={24} color={colors.primary} />
                      </View>
                      <View style={styles.cardInfo}>
                        <Text style={styles.cardTitle}>
                          {getCardLabel(item.cardType)} •••• {item.maskedPan?.slice(-4) || '****'}
                        </Text>
                        <Text style={styles.cardSubtitle}>
                          {t('payment.expires')} {item.expiryDate}
                        </Text>
                      </View>
                      {item.isDefault && (
                        <View style={styles.defaultBadge}>
                          <Text style={styles.defaultBadgeText}>{t('payment.default')}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    <View style={styles.cardActions}>
                      {!item.isDefault && (
                        <TouchableOpacity
                          style={styles.actionButton}
                          onPress={() => handleSetDefault(item)}
                        >
                          <Ionicons name="checkmark-circle-outline" size={20} color={colors.primary} />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleDeleteCard(item)}
                      >
                        <Ionicons name="trash-outline" size={20} color={colors.destructive} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}

            {/* Add Card Button */}
            <TouchableOpacity
              style={[styles.addCardButton, processing && styles.addCardButtonDisabled]}
              onPress={handleAddCard}
              disabled={processing}
              activeOpacity={0.8}
            >
              {processing ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={22} color={colors.primaryForeground} />
                  <Text style={styles.addCardText}>{t('payment.addNewCard')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Security Info */}
          <View style={styles.securitySection}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.mutedForeground} />
            <View style={styles.securityTextContainer}>
              <Text style={styles.securityTitle}>{t('payment.securePayments')}</Text>
              <Text style={styles.securityDesc}>{t('payment.securePaymentsDesc')}</Text>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (typography, colors, insets) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.muted,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.md,
  },
  // Sections
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  sectionHint: {
    ...typography.small,
    color: colors.mutedForeground,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  // Payment method row (cash)
  methodCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    ...shadows.sm,
    overflow: 'hidden',
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  methodIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4CAF50' + '14',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  methodInfo: {
    flex: 1,
  },
  methodTitle: {
    ...typography.body,
    color: colors.foreground,
    fontWeight: '600',
  },
  methodDesc: {
    ...typography.small,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  // Empty state (inline)
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    ...shadows.sm,
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.border + '40',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    ...typography.body,
    color: colors.foreground,
    marginTop: spacing.md,
    fontWeight: '600',
  },
  emptyMessage: {
    ...typography.small,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  // Saved card items
  cardItem: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    ...shadows.sm,
    overflow: 'hidden',
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  cardIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    ...typography.body,
    color: colors.foreground,
    fontWeight: '600',
  },
  cardSubtitle: {
    ...typography.small,
    color: colors.mutedForeground,
    marginTop: 3,
  },
  defaultBadge: {
    backgroundColor: colors.primary + '18',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.full || 999,
  },
  defaultBadgeText: {
    ...typography.small,
    color: colors.primary,
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  actionButton: {
    padding: spacing.sm,
  },
  // Add card button
  addCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: radius.lg,
    marginTop: spacing.md,
  },
  addCardButtonDisabled: {
    opacity: 0.7,
  },
  addCardText: {
    ...typography.body,
    color: colors.primaryForeground,
    fontWeight: '600',
  },
  // Security info
  securitySection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  securityTextContainer: {
    flex: 1,
  },
  securityTitle: {
    ...typography.small,
    color: colors.mutedForeground,
    fontWeight: '600',
    marginBottom: 2,
  },
  securityDesc: {
    ...typography.small,
    color: colors.mutedForeground,
    lineHeight: 18,
    opacity: 0.8,
  },
});
