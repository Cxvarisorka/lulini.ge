import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as WebBrowser from 'expo-web-browser';
import { colors, shadows, radius, useTypography } from '../../theme/colors';
import { paymentAPI } from '../../services/api';

export default function PaymentMethodModal({ visible, onClose, onSelect, amount }) {
  const typography = useTypography();
  const styles = React.useMemo(() => createStyles(typography), [typography]);
  const { t, i18n } = useTranslation();

  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const fetchCards = useCallback(async () => {
    if (!visible) return;
    setLoading(true);
    try {
      const res = await paymentAPI.getSavedCards();
      setCards(res.data?.data?.cards || []);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [visible]);

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
        await WebBrowser.openBrowserAsync(redirectUrl, {
          dismissButtonStyle: 'close',
          presentationStyle: 'pageSheet',
        });

        // Verify card registration with BOG
        if (orderId) {
          try {
            await paymentAPI.verifyCardRegistration(orderId);
          } catch {
            // Non-fatal
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

  const handleSelectCard = async (card) => {
    if (!amount || amount <= 0) {
      // No amount means just selecting card (e.g. from settings)
      onSelect('card', card._id, null);
      onClose();
      return;
    }

    // Pre-charge the card for the ride amount
    setProcessing(true);
    try {
      const lang = i18n.language === 'ka' ? 'ka' : 'en';
      const chargeRes = await paymentAPI.preChargeRide(card._id, amount, lang);
      const { orderId, redirectUrl, paymentId } = chargeRes.data?.data || {};

      if (!orderId) {
        throw new Error('No order ID returned');
      }

      // If BOG requires redirect (user confirmation page)
      if (redirectUrl) {
        await WebBrowser.openBrowserAsync(redirectUrl, {
          dismissButtonStyle: 'close',
          presentationStyle: 'pageSheet',
        });
      }

      // Verify payment status with BOG
      const verifyRes = await paymentAPI.verifyRidePayment(orderId);
      const status = verifyRes.data?.data?.status;
      const confirmedPaymentId = verifyRes.data?.data?.paymentId || paymentId;

      if (status === 'completed') {
        onSelect('card', card._id, confirmedPaymentId);
        onClose();
      } else if (status === 'rejected') {
        Alert.alert(t('errors.error'), t('payment.cardPaymentFailed'));
      } else {
        // Still processing — might be pending
        Alert.alert(t('payment.cardPaymentProcessing'), t('payment.paymentPendingMessage'));
      }
    } catch (err) {
      Alert.alert(
        t('errors.error'),
        err.response?.data?.message || t('payment.cardPaymentFailed')
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
          }
        }
      ]
    );
  };

  const getCardLabel = (cardType) => {
    switch (cardType) {
      case 'visa': return 'Visa';
      case 'mc': return 'Mastercard';
      case 'amex': return 'Amex';
      default: return 'Card';
    }
  };

  const renderCard = ({ item }) => (
    <TouchableOpacity
      style={styles.paymentOption}
      onPress={() => handleSelectCard(item)}
      disabled={processing}
    >
      <View style={styles.iconContainer}>
        <Ionicons name="card" size={28} color={colors.primary} />
      </View>
      <View style={styles.optionContent}>
        <Text style={styles.optionTitle}>
          {getCardLabel(item.cardType)} •••• {item.maskedPan?.slice(-4) || '****'}
        </Text>
        <Text style={styles.optionDescription}>
          {t('payment.expires')} {item.expiryDate}
          {item.isDefault ? ` · ${t('payment.default')}` : ''}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => handleDeleteCard(item)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        disabled={processing}
      >
        <Ionicons name="trash-outline" size={18} color={colors.mutedForeground} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={processing ? undefined : onClose}>
        <View style={styles.modalContainer}>
          <TouchableOpacity activeOpacity={1} style={styles.modalContent}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>{t('taxi.selectPaymentMethod')}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton} disabled={processing}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            {/* Amount info */}
            {amount > 0 && (
              <View style={styles.amountBar}>
                <Text style={styles.amountLabel}>{t('payment.chargeAmount')}</Text>
                <Text style={styles.amountValue}>{amount.toFixed(2)} ₾</Text>
              </View>
            )}

            {/* Processing overlay */}
            {processing && (
              <View style={styles.processingBar}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.processingText}>{t('payment.cardPaymentProcessing')}</Text>
              </View>
            )}

            {/* Content */}
            <View style={styles.optionsContainer}>
              {loading ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ padding: 20 }} />
              ) : (
                <>
                  {cards.length > 0 && (
                    <FlatList
                      data={cards}
                      keyExtractor={(item) => item._id}
                      renderItem={renderCard}
                      scrollEnabled={false}
                      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                    />
                  )}

                  {cards.length === 0 && (
                    <View style={styles.emptyState}>
                      <Ionicons name="card-outline" size={32} color={colors.mutedForeground} />
                      <Text style={styles.emptyText}>{t('payment.noSavedCards')}</Text>
                    </View>
                  )}

                  {/* Add New Card Button */}
                  <TouchableOpacity
                    style={styles.addCardButton}
                    onPress={handleAddCard}
                    disabled={processing}
                  >
                    {processing ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
                    )}
                    <Text style={styles.addCardText}>{t('payment.addNewCard')}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (typography) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContainer: {
      width: '100%',
      maxWidth: 400,
    },
    modalContent: {
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      ...shadows.lg,
      maxHeight: '80%',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      ...typography.h3,
      color: colors.foreground,
      fontWeight: '600',
    },
    closeButton: {
      padding: 4,
    },
    amountBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 12,
      backgroundColor: colors.muted,
    },
    amountLabel: {
      ...typography.bodySmall,
      color: colors.mutedForeground,
    },
    amountValue: {
      ...typography.h3,
      color: colors.foreground,
      fontWeight: '700',
    },
    processingBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      backgroundColor: colors.muted,
    },
    processingText: {
      ...typography.bodySmall,
      color: colors.mutedForeground,
    },
    optionsContainer: {
      padding: 20,
      gap: 12,
    },
    paymentOption: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      backgroundColor: colors.background,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: radius.lg,
      backgroundColor: colors.card,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    optionContent: {
      flex: 1,
    },
    optionTitle: {
      ...typography.body,
      color: colors.foreground,
      fontWeight: '600',
      marginBottom: 2,
    },
    optionDescription: {
      ...typography.small,
      color: colors.mutedForeground,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 20,
      gap: 8,
    },
    emptyText: {
      ...typography.bodySmall,
      color: colors.mutedForeground,
    },
    addCardButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.primary,
      borderStyle: 'dashed',
      marginTop: 4,
    },
    addCardText: {
      ...typography.body,
      color: colors.primary,
      fontWeight: '600',
    },
  });
