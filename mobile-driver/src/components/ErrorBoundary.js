import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import i18next from 'i18next';
import { colors, staticTypography, radius, spacing } from '../theme/colors';

class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error.message, errorInfo?.componentStack);
    try {
      const Sentry = require('@sentry/react-native');
      Sentry.captureException(error, { extra: { componentStack: errorInfo?.componentStack } });
    } catch (_) {
      // Sentry not installed yet
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Ionicons name="warning-outline" size={64} color={colors.destructive} />
          <Text style={styles.title}>{i18next.t('errors.somethingWentWrong')}</Text>
          <Text style={styles.message}>
            {i18next.t('errors.unexpectedError')}
          </Text>
          {__DEV__ && this.state.error && (
            <Text style={styles.errorDetail}>{this.state.error.message}</Text>
          )}
          <TouchableOpacity style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>{i18next.t('common.tryAgain')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

// [M2 FIX] Use theme colors instead of hardcoded values
// [M3 FIX] Use staticTypography (class component can't use hooks)
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing['3xl'],
  },
  title: {
    ...staticTypography.h1,
    fontWeight: '700',
    color: colors.foreground,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  message: {
    ...staticTypography.body,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  errorDetail: {
    ...staticTypography.captionSmall,
    color: colors.text.muted,
    textAlign: 'center',
    fontFamily: 'monospace',
    marginBottom: spacing['2xl'],
    paddingHorizontal: spacing.lg,
  },
  button: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing['3xl'],
    paddingVertical: 14,
    borderRadius: radius.lg,
    marginTop: spacing.md,
  },
  buttonText: {
    ...staticTypography.button,
    color: colors.primaryForeground,
  },
});

export default ErrorBoundary;
