import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, shadows, radius, spacing, useTypography } from '../theme/colors';

export default function SupportHistoryScreen({ navigation }) {
const typography = useTypography();
  const styles = React.useMemo(() => createStyles(typography), [typography]);
    const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  // Mock support tickets - in production, fetch from API
  const [tickets] = useState([
    {
      id: '1',
      subject: 'Driver was late',
      status: 'resolved',
      createdAt: '2026-01-25T10:30:00Z',
      lastUpdated: '2026-01-26T14:20:00Z',
      messages: 3,
    },
    {
      id: '2',
      subject: 'Payment issue',
      status: 'in_progress',
      createdAt: '2026-01-27T09:15:00Z',
      lastUpdated: '2026-01-27T16:45:00Z',
      messages: 2,
    },
    {
      id: '3',
      subject: 'Wrong route taken',
      status: 'open',
      createdAt: '2026-01-28T08:00:00Z',
      lastUpdated: '2026-01-28T08:00:00Z',
      messages: 1,
    },
  ]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'open':
        return colors.info;
      case 'in_progress':
        return colors.warning;
      case 'resolved':
        return colors.success;
      case 'closed':
        return colors.mutedForeground;
      default:
        return colors.mutedForeground;
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'open':
        return t('support.status.open');
      case 'in_progress':
        return t('support.status.inProgress');
      case 'resolved':
        return t('support.status.resolved');
      case 'closed':
        return t('support.status.closed');
      default:
        return status;
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setRefreshing(false);
  };

  const renderTicket = ({ item }) => (
    <TouchableOpacity
      style={styles.ticketCard}
      onPress={() => Alert.alert(item.subject, `${t('support.status.label')}: ${getStatusLabel(item.status)}`)}
    >
      <View style={styles.ticketHeader}>
        <View style={styles.ticketIcon}>
          <Ionicons
            name={
              item.status === 'resolved'
                ? 'checkmark-circle'
                : item.status === 'in_progress'
                ? 'time'
                : 'chatbubble-ellipses'
            }
            size={20}
            color={getStatusColor(item.status)}
          />
        </View>
        <View style={styles.ticketInfo}>
          <Text style={styles.ticketSubject}>{item.subject}</Text>
          <Text style={styles.ticketDate}>
            {t('support.created')}: {formatDate(item.createdAt)}
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.mutedForeground}
        />
      </View>
      <View style={styles.ticketFooter}>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: `${getStatusColor(item.status)}15` },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              { backgroundColor: getStatusColor(item.status) },
            ]}
          />
          <Text
            style={[styles.statusText, { color: getStatusColor(item.status) }]}
          >
            {getStatusLabel(item.status)}
          </Text>
        </View>
        <View style={styles.messagesCount}>
          <Ionicons
            name="chatbubbles-outline"
            size={14}
            color={colors.mutedForeground}
          />
          <Text style={styles.messagesText}>
            {item.messages} {t('support.messages')}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyList = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <Ionicons name="chatbubbles-outline" size={48} color={colors.mutedForeground} />
      </View>
      <Text style={styles.emptyTitle}>{t('support.noTickets')}</Text>
      <Text style={styles.emptySubtitle}>{t('support.noTicketsDesc')}</Text>
      <TouchableOpacity
        style={styles.createButton}
        onPress={() => navigation.navigate('Support')}
      >
        <Ionicons name="add" size={20} color={colors.primaryForeground} />
        <Text style={styles.createButtonText}>{t('support.createTicket')}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={tickets}
        keyExtractor={(item) => item.id}
        renderItem={renderTicket}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + spacing.xl },
          tickets.length === 0 && styles.emptyListContent,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={renderEmptyList}
        ListHeaderComponent={
          tickets.length > 0 ? (
            <Text style={styles.headerText}>
              {t('support.ticketCount', { count: tickets.length })}
            </Text>
          ) : null
        }
      />

      {tickets.length > 0 && (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}
          onPress={() => navigation.navigate('Support')}
        >
          <Ionicons name="add" size={28} color={colors.primaryForeground} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (typography) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.muted,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  emptyListContent: {
    flex: 1,
  },
  headerText: {
    ...typography.buttonSmall,
    color: colors.mutedForeground,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  ticketCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  ticketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ticketIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  ticketInfo: {
    flex: 1,
  },
  ticketSubject: {
    ...typography.h3,
    color: colors.foreground,
  },
  ticketDate: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  ticketFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    marginRight: spacing.xs,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '600',
  },
  messagesCount: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  messagesText: {
    ...typography.caption,
    color: colors.mutedForeground,
    marginLeft: spacing.xs,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.h1,
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  createButtonText: {
    ...typography.h3,
    color: colors.primaryForeground,
    marginLeft: spacing.sm,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.lg,
  },
});
