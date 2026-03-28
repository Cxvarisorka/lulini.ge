import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { shadows, radius, spacing, useTypography } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { safetyAPI } from '../services/api';

const MAX_CONTACTS = 5;

const RELATIONSHIP_OPTIONS = [
  'family',
  'friend',
  'spouse',
  'colleague',
  'other',
];

const EMPTY_FORM = { name: '', phone: '', relationship: '' };

export default function EmergencyContactsScreen({ navigation }) {
  const typography = useTypography();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(typography, colors), [typography, colors]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [contacts, setContacts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingContact, setEditingContact] = useState(null); // null = add mode
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});

  const fetchContacts = useCallback(async () => {
    try {
      const res = await safetyAPI.getEmergencyContacts();
      setContacts(res.data?.contacts || res.data || []);
    } catch (error) {
      if (__DEV__) console.warn('[EmergencyContacts] fetch error:', error.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const openAddModal = () => {
    setEditingContact(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setModalVisible(true);
  };

  const openEditModal = (contact) => {
    setEditingContact(contact);
    setForm({
      name: contact.name || '',
      phone: contact.phone || '',
      relationship: contact.relationship || '',
    });
    setFormErrors({});
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setForm(EMPTY_FORM);
    setFormErrors({});
  };

  const validateForm = () => {
    const errors = {};
    if (!form.name.trim()) {
      errors.name = t('emergencyContacts.nameRequired');
    }
    if (!form.phone.trim()) {
      errors.phone = t('emergencyContacts.phoneRequired');
    } else if (!/^\+?[\d\s\-()]{7,20}$/.test(form.phone.trim())) {
      errors.phone = t('auth.invalidPhone');
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        relationship: form.relationship.trim() || undefined,
      };

      if (editingContact) {
        const res = await safetyAPI.updateEmergencyContact(editingContact._id || editingContact.id, payload);
        const updated = res.data?.contact || res.data;
        setContacts((prev) =>
          prev.map((c) =>
            (c._id || c.id) === (editingContact._id || editingContact.id) ? updated : c
          )
        );
      } else {
        const res = await safetyAPI.addEmergencyContact(payload);
        const newContact = res.data?.contact || res.data;
        setContacts((prev) => [...prev, newContact]);
      }
      closeModal();
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        t('errors.somethingWentWrong');
      Alert.alert(t('common.error'), message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (contact) => {
    Alert.alert(
      t('emergencyContacts.deleteTitle'),
      t('emergencyContacts.deleteMessage', { name: contact.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await safetyAPI.deleteEmergencyContact(contact._id || contact.id);
              setContacts((prev) =>
                prev.filter((c) => (c._id || c.id) !== (contact._id || contact.id))
              );
            } catch (error) {
              const message =
                error?.response?.data?.message ||
                t('errors.somethingWentWrong');
              Alert.alert(t('common.error'), message);
            }
          },
        },
      ]
    );
  };

  const renderContact = ({ item, index }) => (
    <View style={[styles.contactCard, index < contacts.length - 1 && styles.contactCardBorder]}>
      <View style={styles.contactAvatarCircle}>
        <Text style={styles.contactAvatarText}>
          {item.name?.charAt(0)?.toUpperCase() || '?'}
        </Text>
      </View>
      <View style={styles.contactInfo}>
        <Text style={styles.contactName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.contactPhone}>{item.phone}</Text>
        {item.relationship ? (
          <Text style={styles.contactRelationship}>
            {t(`emergencyContacts.relationships.${item.relationship}`, { defaultValue: item.relationship })}
          </Text>
        ) : null}
      </View>
      <View style={styles.contactActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => openEditModal(item)}
          accessibilityRole="button"
          accessibilityLabel={t('common.edit') + ' ' + item.name}
        >
          <Ionicons name="pencil-outline" size={18} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.actionButtonDelete]}
          onPress={() => handleDelete(item)}
          accessibilityRole="button"
          accessibilityLabel={t('common.delete') + ' ' + item.name}
        >
          <Ionicons name="trash-outline" size={18} color={colors.destructive} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="people-outline" size={56} color={colors.mutedForeground} />
      <Text style={styles.emptyTitle}>{t('emergencyContacts.emptyTitle')}</Text>
      <Text style={styles.emptySubtitle}>{t('emergencyContacts.emptySubtitle')}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
        <Text style={styles.infoBannerText}>{t('emergencyContacts.infoBanner')}</Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(item) => String(item._id || item.id || item.phone)}
          renderItem={renderContact}
          ListEmptyComponent={renderEmptyState}
          contentContainerStyle={[
            styles.listContent,
            contacts.length === 0 && styles.listContentEmpty,
          ]}
          style={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            contacts.length > 0 ? (
              <Text style={styles.contactsCount}>
                {contacts.length}/{MAX_CONTACTS} {t('emergencyContacts.contactsCount')}
              </Text>
            ) : null
          }
        />
      )}

      {/* Add button */}
      {contacts.length < MAX_CONTACTS && !isLoading && (
        <View style={[styles.addButtonContainer, { paddingBottom: insets.bottom + spacing.md }]}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={openAddModal}
            accessibilityRole="button"
            accessibilityLabel={t('emergencyContacts.addContact')}
          >
            <Ionicons name="add" size={22} color={colors.background} style={styles.addButtonIcon} />
            <Text style={styles.addButtonText}>{t('emergencyContacts.addContact')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Add/Edit Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={closeModal}
              style={styles.modalCloseButton}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {editingContact ? t('emergencyContacts.editTitle') : t('emergencyContacts.addTitle')}
            </Text>
            <TouchableOpacity
              onPress={handleSave}
              disabled={isSaving}
              style={styles.modalSaveButton}
              accessibilityRole="button"
              accessibilityLabel={t('common.save')}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.modalSaveText}>{t('common.save')}</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            {/* Name */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{t('emergencyContacts.nameLabel')}</Text>
              <View style={[styles.fieldInput, formErrors.name && styles.fieldInputError]}>
                <TextInput
                  style={styles.textInput}
                  value={form.name}
                  onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
                  placeholder={t('emergencyContacts.namePlaceholder')}
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="words"
                  accessibilityLabel={t('emergencyContacts.nameLabel')}
                />
              </View>
              {formErrors.name ? (
                <Text style={styles.fieldError}>{formErrors.name}</Text>
              ) : null}
            </View>

            {/* Phone */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{t('auth.phoneNumber')}</Text>
              <View style={[styles.fieldInput, formErrors.phone && styles.fieldInputError]}>
                <TextInput
                  style={styles.textInput}
                  value={form.phone}
                  onChangeText={(v) => setForm((p) => ({ ...p, phone: v }))}
                  placeholder={t('auth.phonePlaceholder')}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  accessibilityLabel={t('auth.phoneNumber')}
                />
              </View>
              {formErrors.phone ? (
                <Text style={styles.fieldError}>{formErrors.phone}</Text>
              ) : null}
            </View>

            {/* Relationship (optional) */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                {t('emergencyContacts.relationshipLabel')}
                <Text style={styles.optionalLabel}> ({t('common.optional')})</Text>
              </Text>
              <View style={styles.relationshipOptions}>
                {RELATIONSHIP_OPTIONS.map((rel) => (
                  <TouchableOpacity
                    key={rel}
                    style={[
                      styles.relationshipChip,
                      form.relationship === rel && styles.relationshipChipActive,
                    ]}
                    onPress={() =>
                      setForm((p) => ({
                        ...p,
                        relationship: p.relationship === rel ? '' : rel,
                      }))
                    }
                    accessibilityRole="button"
                    accessibilityLabel={t(`emergencyContacts.relationships.${rel}`, { defaultValue: rel })}
                  >
                    <Text
                      style={[
                        styles.relationshipChipText,
                        form.relationship === rel && styles.relationshipChipTextActive,
                      ]}
                    >
                      {t(`emergencyContacts.relationships.${rel}`, { defaultValue: rel })}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const createStyles = (typography, colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.muted,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '10',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary + '20',
  },
  infoBannerText: {
    ...typography.bodySmall,
    color: colors.foreground,
    flex: 1,
    marginLeft: spacing.sm,
    lineHeight: 18,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: spacing.lg,
  },
  listContentEmpty: {
    flex: 1,
  },
  contactsCount: {
    ...typography.label,
    color: colors.mutedForeground,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
    borderRadius: 0,
  },
  contactCardBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  contactAvatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  contactAvatarText: {
    ...typography.h2,
    fontWeight: '700',
    color: colors.primary,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    ...typography.h3,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 2,
  },
  contactPhone: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
  },
  contactRelationship: {
    ...typography.caption,
    color: colors.primary,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  contactActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.sm,
    backgroundColor: colors.muted,
  },
  actionButtonDelete: {
    backgroundColor: colors.destructive + '10',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['2xl'],
  },
  emptyTitle: {
    ...typography.h2,
    color: colors.foreground,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.mutedForeground,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    lineHeight: 22,
  },
  addButtonContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.muted,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.sm,
  },
  addButtonIcon: {
    marginRight: spacing.sm,
  },
  addButtonText: {
    ...typography.h3,
    fontWeight: '600',
    color: colors.background,
  },
  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: colors.muted,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalCloseButton: {
    padding: spacing.sm,
  },
  modalCancelText: {
    ...typography.body,
    color: colors.mutedForeground,
  },
  modalTitle: {
    ...typography.h2,
    fontWeight: '600',
    color: colors.foreground,
  },
  modalSaveButton: {
    padding: spacing.sm,
    minWidth: 48,
    alignItems: 'center',
  },
  modalSaveText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.primary,
  },
  modalBody: {
    padding: spacing.lg,
  },
  fieldGroup: {
    marginBottom: spacing.xl,
  },
  fieldLabel: {
    ...typography.label,
    color: colors.mutedForeground,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  optionalLabel: {
    fontWeight: '400',
  },
  fieldInput: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  fieldInputError: {
    borderColor: colors.destructive,
  },
  textInput: {
    ...typography.body,
    color: colors.foreground,
    padding: spacing.lg,
    minHeight: 52,
  },
  fieldError: {
    ...typography.caption,
    color: colors.destructive,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  relationshipOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  relationshipChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  relationshipChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  relationshipChipText: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    textTransform: 'capitalize',
  },
  relationshipChipTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
});
