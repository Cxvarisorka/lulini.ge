import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  Keyboard,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadows } from '../../theme/colors';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const DraggableBottomSheet = forwardRef(function DraggableBottomSheet({
  children,
  snapPoints = ['25%', '50%', '90%'],
  initialSnapIndex = 1,
  onChange,
  floatingButton,
  headerBar,
  isFullscreen = false,
  handleKeyboard = true,
}, ref) {
  const insets = useSafeAreaInsets();

  // Convert percentage snap points to pixel values
  const snapPointsPixels = snapPoints.map(point => {
    const percentage = parseInt(point) / 100;
    return SCREEN_HEIGHT * (1 - percentage);
  });

  const translateY = useRef(new Animated.Value(snapPointsPixels[initialSnapIndex])).current;
  const lastGestureDy = useRef(0);
  const currentSnapIndex = useRef(initialSnapIndex);
  const preKeyboardSnapIndex = useRef(initialSnapIndex);
  const snapPointsRef = useRef(snapPointsPixels);
  // Keep ref in sync with latest snap points
  useEffect(() => {
    const prevPixels = snapPointsRef.current;
    snapPointsRef.current = snapPointsPixels;
    // Clamp current index to new range
    if (currentSnapIndex.current >= snapPointsPixels.length) {
      currentSnapIndex.current = snapPointsPixels.length - 1;
    }
    const targetY = snapPointsPixels[currentSnapIndex.current];
    // Only animate if the target position actually changed (avoids spurious
    // spring re-triggers when snap point strings change but pixel values match)
    const prevTarget = prevPixels[Math.min(currentSnapIndex.current, prevPixels.length - 1)];
    if (prevTarget !== undefined && Math.abs(targetY - prevTarget) < 1) {
      onChange?.(currentSnapIndex.current);
      return;
    }
    translateY.stopAnimation();
    Animated.spring(translateY, {
      toValue: targetY,
      useNativeDriver: true,
      tension: 100,
      friction: 12,
    }).start();
    onChange?.(currentSnapIndex.current);
  }, [snapPoints.join(',')]);

  // Handle keyboard events — only when handleKeyboard is true (i.e. sheet
  // contains TextInputs). During driver search / ride tracking states there
  // are no inputs, so spurious Android keyboard events (from Alerts, system
  // UI changes, etc.) would cause the sheet to jump up and down rapidly.
  const handleKeyboardRef = useRef(handleKeyboard);
  handleKeyboardRef.current = handleKeyboard;
  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => {
        if (!handleKeyboardRef.current) return;
        // Save current position and snap to highest point
        preKeyboardSnapIndex.current = currentSnapIndex.current;
        const highestIndex = snapPointsRef.current.length - 1;
        if (currentSnapIndex.current < highestIndex) {
          snapToIndex(highestIndex);
        }
      }
    );

    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        if (!handleKeyboardRef.current) return;
        // Restore to previous position
        snapToIndex(preKeyboardSnapIndex.current);
      }
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, []);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const snapToIndex = useCallback((index) => {
    const pts = snapPointsRef.current;
    const clampedIndex = Math.min(index, pts.length - 1);
    currentSnapIndex.current = clampedIndex;
    // Stop any in-flight animation to prevent competing springs
    translateY.stopAnimation();
    Animated.spring(translateY, {
      toValue: pts[clampedIndex],
      useNativeDriver: true,
      tension: 100,
      friction: 12,
    }).start();
    onChangeRef.current?.(clampedIndex);
  }, []);

  // Expose snapToIndex method via ref
  useImperativeHandle(ref, () => ({
    snapToIndex,
    collapse: () => snapToIndex(0),
    expand: () => snapToIndex(snapPointsRef.current.length - 1),
  }), [snapToIndex]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        translateY.extractOffset();
      },
      onPanResponderMove: (_, gestureState) => {
        // Clamp the movement within bounds
        const pts = snapPointsRef.current;
        const minY = pts[pts.length - 1]; // Highest point
        const maxY = pts[0]; // Lowest point

        translateY.setValue(Math.max(minY - pts[currentSnapIndex.current],
          Math.min(maxY - pts[currentSnapIndex.current], gestureState.dy)));
        lastGestureDy.current = gestureState.dy;
      },
      onPanResponderRelease: (_, gestureState) => {
        translateY.flattenOffset();

        const pts = snapPointsRef.current;
        const currentY = pts[currentSnapIndex.current] + gestureState.dy;
        const velocity = gestureState.vy;

        // Find the nearest snap point
        let targetIndex = currentSnapIndex.current;

        if (velocity > 0.5) {
          // Swiping down - go to lower snap point
          targetIndex = Math.max(0, currentSnapIndex.current - 1);
        } else if (velocity < -0.5) {
          // Swiping up - go to higher snap point
          targetIndex = Math.min(pts.length - 1, currentSnapIndex.current + 1);
        } else {
          // Find nearest snap point based on position
          let minDistance = Infinity;
          pts.forEach((point, index) => {
            const distance = Math.abs(currentY - point);
            if (distance < minDistance) {
              minDistance = distance;
              targetIndex = index;
            }
          });
        }

        snapToIndex(targetIndex);
      },
    })
  ).current;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          paddingBottom: insets.bottom,
        },
        isFullscreen && {
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          paddingTop: insets.top,
        },
      ]}
    >
      {/* Floating Button (positioned above the sheet) */}
      {floatingButton && (
        <View style={styles.floatingButtonContainer}>
          {floatingButton}
        </View>
      )}

      {/* Handle / Header Bar */}
      <View {...panResponder.panHandlers} style={styles.handleContainer}>
        {headerBar || <View style={styles.handle} />}
      </View>

      {/* Content */}
      <View style={styles.content}>
        {children}
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: SCREEN_HEIGHT,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    zIndex: 100,
    elevation: 20,
    ...shadows.lg,
  },
  floatingButtonContainer: {
    position: 'absolute',
    top: -60,
    right: 16,
    zIndex: 101,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
});

export default DraggableBottomSheet;
