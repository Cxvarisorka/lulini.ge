import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as WebBrowser from 'expo-web-browser';
import { colors, shadows, radius, spacing, useTypography } from '../theme/colors';
import { paymentAPI } from '../services/api';

export default function PaymentSettingsScreen({ navigation }) {
  const typography = useTypography();
  const styles = React.useMemo(() => createStyles(typography), [typography]);
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();

  const [defaultPayment, setDefaultPayment] = useState('cash');
  const [savedCards, setSavedCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingCard, setAddingCard] = useState(false);

  const fetchCards = useCallback(async () => {
    try {
      const res = await paymentAPI.getSavedCards();
      const cards = res.data?.data?.cards || [];
      setSavedCards(cards);
      // If user has cards and current default is card, keep it
      if (cards.length > 0 && defaultPayment === 'card') {
        setDefaultPayment('card');
      }
    } catch {
      setSavedCards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh cards when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchCards();
    }, [fetchCards])
  );

  const paymentMethods = [
    {
      id: 'cash',
      icon: 'cash',
      label: t('payment.cash'),
      description: t('payment.cashDesc'),
    },
    {
      id: 'card',
      icon: 'card',
      label: t('payment.card'),
      description: t('payment.cardDesc'),
      disabled: savedCards.length === 0,
    },
  ];

  const getCardLabel = (type) => {
    switch (type) {
      case 'visa': return 'Visa';
      case 'mc': return 'Mastercard';
      case 'amex': return 'Amex';
      default: return 'Card';
    }
  };

  const handleAddCard = async () => {
    setAddingCard(true);
    try {
      const lang = i18n.language === 'ka' ? 'ka' : 'en';
      const res = await paymentAPI.registerCard(lang);
      const { redirectUrl, orderId } = res.data?.data || {};

      if (redirectUrl) {
        // openAuthSessionAsync auto-closes when BOG redirects back to
        // our lulini:// scheme (302 → lulini://payment/success or fail)
        const result = await WebBrowser.openAuthSessionAsync(
          redirectUrl,
          'lulini://'
        );

        // Verify card registration regardless of how browser closed
        // (user may dismiss, payment may succeed or fail)
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
      setAddingCard(false);
    }
  };

  const handleRemoveCard = (cardId) => {
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
              await paymentAPI.deleteCard(cardId);
              setSavedCards((prev) => prev.filter((card) => card._id !== cardId));
            } catch {
              Alert.alert(t('errors.error'), t('errors.somethingWentWrong'));
            }
          },
        },
      ]
    );
  };

  const handleSetDefault = async (cardId) => {
    try {
      await paymentAPI.setDefaultCard(cardId);
      setSavedCards(prev => prev.map(c => ({
        ...c,
        isDefault: c._id === cardId
      })));
    } catch {
      Alert.alert(t('errors.error'), t('errors.somethingWentWrong'));
    }
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
        {/* Default Payment Method */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('payment.defaultMethod')}</Text>
          <View style={styles.sectionContent}>
            {paymentMethods.map((method, index) => (
              <TouchableOpacity
                key={method.id}
                style={[
                  styles.paymentOption,
                  index !== paymentMethods.length - 1 && styles.paymentOptionBorder,
                  method.disabled && styles.paymentOptionDisabled,
                ]}
                onPress={() => {
                  if (method.id === 'card' && savedCards.length === 0) {
                    handleAddCard();
                    return;
                  }
                  setDefaultPayment(method.id);
                }}
              >
                <View style={styles.paymentIcon}>
                  <Ionicons name={method.icon} size={22} color={colors.primary} />
                </View>
                <View style={styles.paymentContent}>
                  <Text style={styles.paymentLabel}>{method.label}</Text>
                  <Text style={styles.paymentDescription}>
                    {method.id === 'card' && savedCards.length === 0
                      ? t('payment.addCardToUse')
                      : method.description}
                  </Text>
                </View>
                <View
                  style={[
                    styles.radioOuter,
                    defaultPayment === method.id && styles.radioOuterSelected,
                  ]}
                >
                  {defaultPayment === method.id && (
                    <View style={styles.radioInner} />
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Saved Cards */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('payment.savedCards')}</Text>
          <View style={styles.sectionContent}>
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ padding: 24 }} />
            ) : savedCards.length > 0 ? (
              savedCards.map((card, index) => (
                <View
                  key={card._id}
                  style={[
                    styles.cardItem,
                    index !== savedCards.length - 1 && styles.cardItemBorder,
                  ]}
                >
                  <TouchableOpacity
                    style={styles.cardMainContent}
                    onPress={() => handleSetDefault(card._id)}
                  >
                    <View style={styles.cardIcon}>
                      <Ionicons name="card" size={22} color={colors.primary} />
                    </View>
                    <View style={styles.cardContent}>
                      <Text style={styles.cardNumber}>
                        {getCardLabel(card.cardType)} •••• {card.maskedPan?.slice(-4) || '****'}
                      </Text>
                      <Text style={styles.cardExpiry}>
                        {t('payment.expires')} {card.expiryDate}
                        {card.isDefault ? ` · ${t('payment.default')}` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveCard(card._id)}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={colors.destructive}
                    />
                  </TouchableOpacity>
                </View>
              ))
            ) : (
              <View style={styles.emptyCards}>
                <Ionicons
                  name="card-outline"
                  size={40}
                  color={colors.mutedForeground}
                />
                <Text style={styles.emptyCardsText}>
                  {t('payment.noSavedCards')}
                </Text>
              </View>
            )}

            {/* Add Card Button */}
            <TouchableOpacity
              style={styles.addCardButton}
              onPress={handleAddCard}
              disabled={addingCard}
            >
              {addingCard ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="add-circle" size={22} color={colors.primary} />
              )}
              <Text style={styles.addCardText}>{t('payment.addNewCard')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Payment Tips */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('payment.tipsSettings')}</Text>
          <View style={styles.sectionContent}>
            <View style={styles.tipInfo}>
              <Ionicons
                name="information-circle"
                size={24}
                color={colors.info}
              />
              <Text style={styles.tipInfoText}>
                {t('payment.tipsInfo')}
              </Text>
            </View>
          </View>
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
    color: colors.mutedForeground,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  sectionContent: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  paymentOptionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  paymentOptionDisabled: {
    opacity: 0.6,
  },
  paymentIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  paymentContent: {
    flex: 1,
  },
  paymentLabel: {
    ...typography.h2,
    color: colors.foreground,
  },
  paymentDescription: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterSelected: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  cardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  cardItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cardMainContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  cardContent: {
    flex: 1,
  },
  cardNumber: {
    ...typography.h2,
    color: colors.foreground,
  },
  cardExpiry: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  removeButton: {
    padding: spacing.sm,
  },
  emptyCards: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
  },
  emptyCardsText: {
    ...typography.body,
    color: colors.mutedForeground,
    marginTop: spacing.sm,
  },
  addCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  addCardText: {
    ...typography.h3,
    color: colors.primary,
  },
  tipInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.lg,
  },
  tipInfoText: {
    ...typography.body,
    flex: 1,
    color: colors.mutedForeground,
    marginLeft: spacing.md,
  },
});
