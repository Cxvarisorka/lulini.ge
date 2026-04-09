import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { radius, shadows, useTypography } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { chatAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { messageSent as playMessageSent, messageReceived as playMessageReceived } from '../utils/sounds';

export default function ChatScreen({ route, navigation }) {
  const { rideId, driverName } = route.params || {};
  const { t } = useTranslation();
  const typography = useTypography();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(typography, colors), [typography, colors]);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { socket } = useSocket();

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef(null);
  const myId = user?._id || user?.id;

  // Mark messages as read whenever the screen is focused
  useFocusEffect(
    useCallback(() => {
      if (!rideId) return;
      chatAPI.markAsRead(rideId).catch(() => {
        // Silent fail — badge clearing is best-effort
      });
    }, [rideId])
  );

  // Load history
  useEffect(() => {
    if (!rideId) return;
    let mounted = true;
    (async () => {
      try {
        const res = await chatAPI.getMessages(rideId);
        if (res.data.success && mounted) {
          const msgs = res.data.data?.messages || res.data.data;
          setMessages(Array.isArray(msgs) ? msgs : []);
        }
      } catch (e) {
        if (__DEV__) console.warn('[Chat] load error:', e.message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [rideId]);

  // Socket listener for incoming messages
  useEffect(() => {
    if (!socket) return;

    const handleChatMessage = (data) => {
      // Server emits { rideId, message } — extract the actual message
      if (String(data.rideId) !== String(rideId)) return;
      const msg = data.message || data;
      if (!msg || !msg._id) return;
      // Play sound for incoming messages from the other party
      const senderId = typeof msg.sender === 'object' ? (msg.sender?._id || msg.sender?.id) : msg.sender;
      if (String(senderId) !== String(myId)) {
        playMessageReceived();
      }
      setMessages(prev => {
        if (!Array.isArray(prev)) return [msg];
        // Avoid duplicates (optimistic update already added a temp version)
        if (prev.some(m => m._id === msg._id)) return prev;
        // Replace temp message if this is the confirmed version
        const tempIdx = prev.findIndex(m => m.pending && m.content === msg.content);
        if (tempIdx !== -1) {
          const next = [...prev];
          next[tempIdx] = msg;
          return next;
        }
        return [...prev, msg];
      });
    };

    socket.on('chat:message', handleChatMessage);
    return () => {
      socket.off('chat:message', handleChatMessage);
    };
  }, [socket, rideId]);

  // Auto-scroll when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    setInputText('');
    Keyboard.dismiss();
    setSending(true);

    // Optimistic update
    const tempMsg = {
      _id: `temp-${Date.now()}`,
      content: text,
      sender: myId,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setMessages(prev => Array.isArray(prev) ? [...prev, tempMsg] : [tempMsg]);

    try {
      const res = await chatAPI.sendMessage(rideId, text);
      if (res.data.success) {
        playMessageSent();
        const realMsg = res.data.data?.message || res.data.data;
        // Replace temp with real message
        setMessages(prev =>
          Array.isArray(prev)
            ? prev.map(m => m._id === tempMsg._id ? realMsg : m)
            : [realMsg]
        );
      }
    } catch (e) {
      // Mark as failed
      setMessages(prev =>
        Array.isArray(prev)
          ? prev.map(m =>
              m._id === tempMsg._id ? { ...m, failed: true, pending: false } : m
            )
          : []
      );
    } finally {
      setSending(false);
    }
  }, [inputText, sending, rideId, myId]);

  const renderMessage = useCallback(({ item }) => {
    // sender can be a populated object { _id, firstName, ... } or a plain ID string
    const senderId = typeof item.sender === 'object' ? (item.sender?._id || item.sender?.id) : item.sender;
    const isMine = String(senderId) === String(myId);
    return (
      <View style={[styles.bubbleWrapper, isMine ? styles.bubbleRight : styles.bubbleLeft]}>
        <View style={[
          styles.bubble,
          isMine ? styles.bubbleSent : styles.bubbleReceived,
          item.failed && styles.bubbleFailed,
        ]}>
          <Text style={[
            styles.bubbleText,
            isMine ? styles.bubbleTextSent : styles.bubbleTextReceived,
          ]}>
            {item.content || item.text}
          </Text>
          <View style={styles.bubbleMeta}>
            {item.pending && (
              <ActivityIndicator size="small" color={colors.primaryForeground + '80'} style={styles.pendingIndicator} />
            )}
            {item.failed && (
              <Ionicons name="alert-circle" size={12} color={colors.destructive} />
            )}
            <Text style={[
              styles.bubbleTime,
              isMine ? styles.bubbleTimeSent : styles.bubbleTimeReceived,
            ]}>
              {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        </View>
      </View>
    );
  }, [myId, styles]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Driver Name Header */}
      <View style={styles.chatHeader}>
        <View style={styles.driverAvatar}>
          <Ionicons name="person" size={22} color={colors.primary} />
        </View>
        <View>
          <Text style={styles.driverName}>{driverName || t('taxi.driver')}</Text>
          <Text style={styles.activeLabel}>{t('chat.activeRide')}</Text>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item, index) => item._id || `msg-${index}`}
        renderItem={renderMessage}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={48} color={colors.border} />
            <Text style={styles.emptyTitle}>{t('chat.noMessages')}</Text>
            <Text style={styles.emptyDesc}>{t('chat.startConversation')}</Text>
          </View>
        }
      />

      {/* Input Bar */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder={t('chat.inputPlaceholder')}
          placeholderTextColor={colors.mutedForeground}
          multiline
          maxLength={500}
          accessibilityLabel={t('chat.inputPlaceholder')}
          accessibilityHint={t('chat.sendHint')}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel={t('chat.send')}
          accessibilityState={{ disabled: !inputText.trim() || sending }}
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <Ionicons name="send" size={18} color={colors.background} />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (typography, colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.muted,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadows.sm,
  },
  driverAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverName: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
  },
  activeLabel: {
    ...typography.captionSmall,
    color: colors.success,
    marginTop: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 8,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  bubbleWrapper: {
    marginBottom: 8,
    maxWidth: '80%',
  },
  bubbleLeft: {
    alignSelf: 'flex-start',
  },
  bubbleRight: {
    alignSelf: 'flex-end',
  },
  bubble: {
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...shadows.sm,
  },
  bubbleSent: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleReceived: {
    backgroundColor: colors.background,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleFailed: {
    opacity: 0.6,
  },
  bubbleText: {
    ...typography.bodyMedium,
    lineHeight: 22,
  },
  bubbleTextSent: {
    color: colors.primaryForeground,
  },
  bubbleTextReceived: {
    color: colors.foreground,
  },
  bubbleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  pendingIndicator: {
    transform: [{ scale: 0.7 }],
  },
  bubbleTime: {
    ...typography.captionSmall,
  },
  bubbleTimeSent: {
    color: colors.primaryForeground + 'aa',
  },
  bubbleTimeReceived: {
    color: colors.mutedForeground,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 10,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.foreground,
    marginTop: 8,
  },
  emptyDesc: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.muted,
    borderRadius: radius.xl,
    paddingHorizontal: 16,
    paddingVertical: 10,
    ...typography.bodyMedium,
    color: colors.foreground,
    maxHeight: 100,
    minHeight: 42,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
});
