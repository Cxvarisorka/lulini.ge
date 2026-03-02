import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { authAPI } from '../services/api';
import { colors, shadows, radius, useTypography } from '../theme/colors';

export default function ProfileScreen({ navigation }) {
  const { t, i18n } = useTranslation();
  const { user, logout, refreshUser } = useAuth();
  const { getCurrentLanguageInfo } = useLanguage();
  const typography = useTypography();

  const currentLang = getCurrentLanguageInfo();
  const styles = React.useMemo(() => createStyles(typography), [typography]);

  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  const handleEmailUpdate = async () => {
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(emailInput.trim())) {
      Alert.alert(t('errors.error'), t('auth.invalidEmail'));
      return;
    }

    setEmailLoading(true);
    try {
      const response = await authAPI.updateEmail(emailInput.trim());
      if (response.data.success) {
        await refreshUser();
        setEmailModalVisible(false);
        setEmailInput('');
        Alert.alert(t('common.success'), t('profile.emailUpdated'));
      }
    } catch (error) {
      const message = error.response?.data?.message || t('errors.tryAgain');
      Alert.alert(t('errors.error'), message);
    } finally {
      setEmailLoading(false);
    }
  };

  const openEmailModal = () => {
    setEmailInput(user.email || '');
    setEmailModalVisible(true);
  };

  const handleLogout = () => {
    Alert.alert(
      t('profile.logout'),
      t('profile.logoutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('profile.logout'), style: 'destructive', onPress: logout },
      ]
    );
  };

  const getInitials = () => {
    if (!user) return '?';
    return `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  };

  // M8: Use i18n.language instead of hardcoded en-US
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <Text>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          {user.avatar ? (
            <Image source={{ uri: user.avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{getInitials()}</Text>
            </View>
          )}
        </View>
        <Text style={styles.name} numberOfLines={2}>{user.firstName} {user.lastName}</Text>
        {user.email ? (
          <Text style={styles.email} numberOfLines={1} ellipsizeMode="middle">{user.email}</Text>
        ) : (
          <TouchableOpacity onPress={openEmailModal}>
            <Text style={styles.addEmailLink}>{t('profile.addEmail')}</Text>
          </TouchableOpacity>
        )}
        {user.role === 'admin' && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t('profile.admin')}</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} numberOfLines={1}>{t('profile.accountInfo')}</Text>

        <View style={styles.infoCard}>
          <TouchableOpacity
            style={styles.infoRow}
            onPress={openEmailModal}
            activeOpacity={0.7}
          >
            <View style={styles.infoIconContainer}>
              <Ionicons name="mail-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel} numberOfLines={1}>{t('profile.emailLabel')}</Text>
              <Text style={[styles.infoValue, !user.email && styles.notProvidedText]} numberOfLines={1}>
                {user.email || t('profile.notProvided')}
              </Text>
            </View>
            <View style={styles.editIconContainer}>
              <Ionicons
                name={user.email ? "create-outline" : "add-circle-outline"}
                size={20}
                color={user.email ? colors.mutedForeground : colors.primary}
              />
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.infoRow}
            onPress={() => navigation.navigate('UpdatePhone')}
            activeOpacity={0.7}
          >
            <View style={styles.infoIconContainer}>
              <Ionicons name="call-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel} numberOfLines={1}>{t('profile.phoneLabel')}</Text>
              <Text style={[styles.infoValue, !user.phone && styles.notProvidedText]} numberOfLines={1}>
                {user.phone || t('profile.notProvided')}
              </Text>
            </View>
            <View style={styles.editIconContainer}>
              <Ionicons
                name={user.phone ? "create-outline" : "add-circle-outline"}
                size={20}
                color={user.phone ? colors.mutedForeground : colors.primary}
              />
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.infoIconContainer}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel} numberOfLines={1}>{t('profile.accountStatus')}</Text>
              <Text style={[styles.infoValue, { color: user.isVerified ? colors.success : colors.warning }]} numberOfLines={1}>
                {user.isVerified ? t('profile.verified') : t('profile.unverified')}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.infoIconContainer}>
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel} numberOfLines={1}>{t('profile.memberSince')}</Text>
              <Text style={styles.infoValue} numberOfLines={1}>{formatDate(user.createdAt)}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.infoIconContainer}>
              <Ionicons name="key-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel} numberOfLines={1}>{t('profile.loginProvider')}</Text>
              <Text style={styles.infoValue} numberOfLines={1}>
                {user.provider === 'local' ? t('profile.emailPassword') :
                 user.provider?.charAt(0).toUpperCase() + user.provider?.slice(1)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} numberOfLines={1}>{t('profile.quickActions')}</Text>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('TaxiHistory')}
        >
          <View style={styles.actionLeft}>
            <Ionicons name="car-outline" size={24} color={colors.primary} />
            <Text style={styles.actionText} numberOfLines={1}>{t('profile.myRides')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Taxi')}
        >
          <View style={styles.actionLeft}>
            <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
            <Text style={styles.actionText} numberOfLines={1}>{t('profile.bookTaxi')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} numberOfLines={1}>{t('profile.settings')}</Text>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('LanguageSelect')}
        >
          <View style={styles.actionLeft}>
            <Ionicons name="language-outline" size={24} color={colors.primary} />
            <Text style={styles.actionText} numberOfLines={1}>{t('profile.language')}</Text>
          </View>
          <View style={styles.actionRight}>
            <Text style={styles.languageText} numberOfLines={1}>{currentLang.nativeName}</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
          </View>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={24} color={colors.destructive} />
        <Text style={styles.logoutText} numberOfLines={1}>{t('profile.logout')}</Text>
      </TouchableOpacity>

      <View style={styles.bottomPadding} />

      {/* Email Update Modal */}
      <Modal
        visible={emailModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEmailModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setEmailModalVisible(false)}
          >
            <TouchableOpacity activeOpacity={1} style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {user.email ? t('profile.editEmail') : t('profile.addEmail')}
              </Text>
              <View style={styles.modalInputWrapper}>
                <Ionicons name="mail-outline" size={20} color={colors.mutedForeground} />
                <TextInput
                  style={styles.modalInput}
                  placeholder={t('auth.emailPlaceholder')}
                  placeholderTextColor={colors.mutedForeground}
                  value={emailInput}
                  onChangeText={setEmailInput}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
              </View>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setEmailModalVisible(false)}
                >
                  <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSaveButton, emailLoading && styles.buttonDisabled]}
                  onPress={handleEmailUpdate}
                  disabled={emailLoading}
                >
                  {emailLoading ? (
                    <ActivityIndicator color={colors.primaryForeground} size="small" />
                  ) : (
                    <Text style={styles.modalSaveText}>{t('common.save')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const createStyles = (typography) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.muted,
  },
  header: {
    backgroundColor: colors.background,
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 28,
    paddingHorizontal: 20,
    borderBottomLeftRadius: radius['2xl'],
    borderBottomRightRadius: radius['2xl'],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  avatarContainer: {
    marginBottom: 14,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  avatarPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: typography.display.fontSize * 1.6,
    fontWeight: '700',
    color: colors.primaryForeground,
  },
  name: {
    fontSize: typography.display.fontSize,
    fontWeight: '700',
    lineHeight: typography.display.lineHeight,
    letterSpacing: typography.display.letterSpacing,
    color: colors.foreground,
    marginBottom: 6,
    paddingHorizontal: 16,
    textAlign: 'center',
  },
  email: {
    ...typography.body,
    color: colors.mutedForeground,
    paddingHorizontal: 16,
    textAlign: 'center',
  },
  addEmailLink: {
    ...typography.body,
    color: colors.primary,
    textAlign: 'center',
  },
  badge: {
    backgroundColor: `${colors.primary}15`,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.full,
    marginTop: 8,
    borderWidth: 1,
    borderColor: `${colors.primary}30`,
  },
  badgeText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    ...typography.h1,
    color: colors.foreground,
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    ...typography.caption,
    color: colors.mutedForeground,
    marginBottom: 2,
  },
  infoValue: {
    ...typography.bodyMedium,
    color: colors.foreground,
  },
  notProvidedText: {
    color: colors.warning,
    fontStyle: 'italic',
  },
  editIconContainer: {
    marginLeft: 8,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  actionButton: {
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: radius.lg,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  actionText: {
    ...typography.h2,
    fontWeight: '400',
    color: colors.foreground,
    marginLeft: 12,
    flexShrink: 1,
  },
  actionRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  languageText: {
    ...typography.body,
    color: colors.mutedForeground,
    marginRight: 4,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.destructive + '10',
    marginHorizontal: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.destructive + '20',
  },
  logoutText: {
    ...typography.h2,
    color: colors.destructive,
    marginLeft: 10,
  },
  bottomPadding: {
    height: 40,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    ...typography.h1,
    color: colors.foreground,
    marginBottom: 20,
  },
  modalInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  modalInput: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    ...typography.body,
    color: colors.foreground,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: radius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCancelText: {
    ...typography.button,
    color: colors.foreground,
  },
  modalSaveButton: {
    flex: 1,
    padding: 14,
    borderRadius: radius.lg,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  modalSaveText: {
    ...typography.button,
    color: colors.primaryForeground,
  },
});
