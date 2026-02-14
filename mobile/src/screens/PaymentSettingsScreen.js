import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, shadows, radius, spacing, useTypography } from '../theme/colors';

export default function PaymentSettingsScreen({ navigation }) {
const typography = useTypography();
  const styles = React.useMemo(() => createStyles(typography), [typography]);
    const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // Payment preferences state
  const [defaultPayment, setDefaultPayment] = useState('cash');
  const [savedCards, setSavedCards] = useState([
    // Mock data - in production, this would come from the backend
    // { id: '1', type: 'visa', last4: '4242', expiry: '12/26' },
    // { id: '2', type: 'mastercard', last4: '8888', expiry: '09/25' },
  ]);

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
    },
    {
      id: 'corporate',
      icon: 'business',
      label: t('payment.corporate'),
      description: t('payment.corporateDesc'),
    },
  ];

  const getCardIcon = (type) => {
    switch (type) {
      case 'visa':
        return 'card';
      case 'mastercard':
        return 'card';
      default:
        return 'card-outline';
    }
  };

  const handleAddCard = () => {
    Alert.alert(
      t('payment.addCard'),
      t('payment.addCardMessage'),
      [{ text: t('common.ok') }]
    );
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
          onPress: () => {
            setSavedCards((prev) => prev.filter((card) => card.id !== cardId));
          },
        },
      ]
    );
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
                ]}
                onPress={() => setDefaultPayment(method.id)}
              >
                <View style={styles.paymentIcon}>
                  <Ionicons name={method.icon} size={22} color={colors.primary} />
                </View>
                <View style={styles.paymentContent}>
                  <Text style={styles.paymentLabel}>{method.label}</Text>
                  <Text style={styles.paymentDescription}>{method.description}</Text>
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
            {savedCards.length > 0 ? (
              savedCards.map((card, index) => (
                <View
                  key={card.id}
                  style={[
                    styles.cardItem,
                    index !== savedCards.length - 1 && styles.cardItemBorder,
                  ]}
                >
                  <View style={styles.cardIcon}>
                    <Ionicons
                      name={getCardIcon(card.type)}
                      size={22}
                      color={colors.primary}
                    />
                  </View>
                  <View style={styles.cardContent}>
                    <Text style={styles.cardNumber}>
                      •••• •••• •••• {card.last4}
                    </Text>
                    <Text style={styles.cardExpiry}>
                      {t('payment.expires')} {card.expiry}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveCard(card.id)}
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
            <TouchableOpacity style={styles.addCardButton} onPress={handleAddCard}>
              <Ionicons name="add-circle" size={22} color={colors.primary} />
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

        {/* Payment History Link */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.historyLink}>
            <View style={styles.historyIcon}>
              <Ionicons name="receipt" size={22} color={colors.primary} />
            </View>
            <Text style={styles.historyText}>{t('payment.viewHistory')}</Text>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.mutedForeground}
            />
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
    letterSpacing: 1,
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
  },
  addCardText: {
    ...typography.h3,
    color: colors.primary,
    marginLeft: spacing.sm,
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
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  historyIcon: {
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
  historyText: {
    ...typography.h3,
    flex: 1,
    color: colors.foreground,
  },
});
