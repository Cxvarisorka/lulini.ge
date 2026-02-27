import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
      // Sentry not available
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Ionicons name="warning-outline" size={64} color="#dc2626" />
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            The app encountered an unexpected error.{'\n'}Please try again.
          </Text>
          {__DEV__ && this.state.error && (
            <Text style={styles.errorDetail}>{this.state.error.message}</Text>
          )}
          <TouchableOpacity style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    marginTop: 20,
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 12,
  },
  errorDetail: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    fontFamily: 'monospace',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  button: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ErrorBoundary;
