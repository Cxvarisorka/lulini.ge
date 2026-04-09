import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { chatAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { colors, shadows, radius, spacing, useTypography } from '../theme/colors';
import { messageSent as playMessageSent, messageReceived as playMessageReceived } from '../utils/sounds';

export default function ChatScreen({ navigation, route }) {
  const { rideId, passengerName } = route.params;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const typography = useTypography();
  const styles = useMemo(() => createStyles(typography), [typography]);

  const { socket } = useSocket();
  const { user } = useAuth();

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const flatListRef = useRef(null);

  // Mark messages as read whenever the screen is focused
  useFocusEffect(
    useCallback(() => {
      if (!rideId) return;
      chatAPI.markAsRead(rideId).catch(() => {
        // Silent fail — badge clearing is best-effort
      });
    }, [rideId])
  );

  // Load message history on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const response = await chatAPI.getMessages(rideId);
        if (mounted && response.data?.data?.messages) {
          setMessages(response.data.data.messages);
        }
      } catch {
        // Silently fail — chat still works via socket
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [rideId]);

  // Listen for incoming chat messages via socket
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (data) => {
      // Server emits { rideId, message }
      if (String(data.rideId) !== String(rideId)) return;
      const msg = data.message || data;
      if (!msg || !msg._id) return;
      // Play sound for incoming messages from the other party
      if (msg.senderRole !== 'driver') {
        playMessageReceived();
      }
      setMessages((prev) => {
        if (!Array.isArray(prev)) return [msg];
        if (prev.some((m) => m._id === msg._id)) return prev;
        // Replace optimistic temp message if content matches
        const tempIdx = prev.findIndex(m => m.pending && m.content === msg.content);
        if (tempIdx !== -1) {
          const next = [...prev];
          next[tempIdx] = msg;
          return next;
        }
        return [...prev, msg];
      });
    };

    socket.on('chat:message', handleMessage);
    return () => {
      socket.off('chat:message', handleMessage);
    };
  }, [socket, rideId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    setInputText('');
    setSending(true);

    // Optimistic update
    const optimisticMsg = {
      _id: `temp_${Date.now()}`,
      rideId,
      content: text,
      senderRole: 'driver',
      sender: user?._id,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const response = await chatAPI.sendMessage(rideId, text);
      if (response.data?.data?.message) {
        playMessageSent();
        const serverMsg = response.data.data.message;
        setMessages((prev) =>
          prev.map((m) => (m._id === optimisticMsg._id ? serverMsg : m))
        );
      }
    } catch {
      // Remove the optimistic message on failure
      setMessages((prev) => prev.filter((m) => m._id !== optimisticMsg._id));
      setInputText(text); // Restore text so user can retry
    } finally {
      setSending(false);
    }
  }, [inputText, sending, rideId, user?._id]);

  const renderMessage = useCallback(({ item }) => {
    const isFromDriver = item.senderRole === 'driver' || item.senderType === 'driver';
    const timeStr = item.createdAt
      ? new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

    return (
      <View
        style={[styles.messageBubbleWrapper, isFromDriver ? styles.sentWrapper : styles.receivedWrapper]}
        accessible
        accessibilityLabel={t('chat.messageBubble', {
          sender: isFromDriver ? t('chat.you') : t('chat.passenger'),
        }) + ': ' + item.content}
      >
        <View style={[
          styles.messageBubble,
          isFromDriver ? styles.sentBubble : styles.receivedBubble,
          item.pending && styles.pendingBubble,
        ]}>
          <Text style={[
            styles.messageText,
            isFromDriver ? styles.sentText : styles.receivedText,
          ]}>
            {item.content}
          </Text>
        </View>
        <Text style={[styles.messageTime, isFromDriver ? styles.sentTime : styles.receivedTime]}>
          {timeStr}
        </Text>
      </View>
    );
  }, [styles, t]);

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="chatbubbles-outline" size={56} color={colors.mutedForeground} />
      <Text style={styles.emptyTitle}>{t('chat.noMessages')}</Text>
      <Text style={styles.emptySubtitle}>{t('chat.noMessagesDesc')}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {passengerName || t('chat.passenger')}
          </Text>
          <View style={styles.connectedRow}>
            <View style={styles.connectedDot} />
            <Text style={styles.connectedText}>{t('chat.connected')}</Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item, index) => item._id || `msg-${index}`}
            renderItem={renderMessage}
            ListEmptyComponent={renderEmpty}
            contentContainerStyle={[
              styles.messagesList,
              messages.length === 0 && styles.messagesListEmpty,
            ]}
            onContentSizeChange={() => {
              if (messages.length > 0) {
                flatListRef.current?.scrollToEnd({ animated: false });
              }
            }}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Input Bar */}
        <View style={[styles.inputBar, { paddingBottom: insets.bottom + spacing.sm }]}>
          <TextInput
            style={styles.input}
            placeholder={t('chat.typeMessage')}
            placeholderTextColor={colors.mutedForeground}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            accessibilityLabel={t('chat.messageInput')}
            accessibilityHint={t('chat.typeMessage')}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel={t('chat.sendButton')}
            accessibilityState={{ disabled: !inputText.trim() || sending }}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Ionicons name="send" size={20} color={colors.primaryForeground} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const createStyles = (typography) => StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
    ...shadows.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.foreground,
    fontWeight: '600',
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  connectedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginRight: 5,
  },
  connectedText: {
    ...typography.captionSmall,
    color: colors.success,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesList: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  messagesListEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.foreground,
    marginTop: spacing.md,
    fontWeight: '600',
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  messageBubbleWrapper: {
    marginVertical: 2,
    maxWidth: '78%',
  },
  sentWrapper: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  receivedWrapper: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  messageBubble: {
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  sentBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  receivedBubble: {
    backgroundColor: colors.muted,
    borderBottomLeftRadius: 4,
  },
  pendingBubble: {
    opacity: 0.7,
  },
  messageText: {
    ...typography.body,
    lineHeight: 20,
  },
  sentText: {
    color: colors.primaryForeground,
  },
  receivedText: {
    color: colors.foreground,
  },
  messageTime: {
    ...typography.captionSmall,
    marginTop: 3,
    color: colors.mutedForeground,
  },
  sentTime: {
    alignSelf: 'flex-end',
  },
  receivedTime: {
    alignSelf: 'flex-start',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.muted,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : spacing.xs,
    ...typography.body,
    color: colors.foreground,
    maxHeight: 120,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.mutedForeground,
  },
});
