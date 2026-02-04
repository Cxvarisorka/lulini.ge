import React, { useRef, useEffect, useCallback, useState, useImperativeHandle, forwardRef } from 'react';
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
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Update snap points when they change
  useEffect(() => {
    Animated.spring(translateY, {
      toValue: snapPointsPixels[currentSnapIndex.current],
      useNativeDriver: true,
      tension: 100,
      friction: 12,
    }).start();
  }, [snapPoints]);

  // Handle keyboard events
  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => {
        setKeyboardHeight(event.endCoordinates.height);
        setIsKeyboardVisible(true);
        // Save current position and snap to highest point
        preKeyboardSnapIndex.current = currentSnapIndex.current;
        const highestIndex = snapPointsPixels.length - 1;
        if (currentSnapIndex.current < highestIndex) {
          snapToIndex(highestIndex);
        }
      }
    );

    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
        setIsKeyboardVisible(false);
        // Restore to previous position
        snapToIndex(preKeyboardSnapIndex.current);
      }
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, [snapPointsPixels]);

  const snapToIndex = useCallback((index) => {
    currentSnapIndex.current = index;
    Animated.spring(translateY, {
      toValue: snapPointsPixels[index],
      useNativeDriver: true,
      tension: 100,
      friction: 12,
    }).start();
    onChange?.(index);
  }, [snapPointsPixels, onChange]);

  // Expose snapToIndex method via ref
  useImperativeHandle(ref, () => ({
    snapToIndex,
    collapse: () => snapToIndex(0),
    expand: () => snapToIndex(snapPointsPixels.length - 1),
  }), [snapToIndex, snapPointsPixels]);

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
        const minY = snapPointsPixels[snapPointsPixels.length - 1]; // Highest point
        const maxY = snapPointsPixels[0]; // Lowest point

        translateY.setValue(Math.max(minY - snapPointsPixels[currentSnapIndex.current],
          Math.min(maxY - snapPointsPixels[currentSnapIndex.current], gestureState.dy)));
        lastGestureDy.current = gestureState.dy;
      },
      onPanResponderRelease: (_, gestureState) => {
        translateY.flattenOffset();

        const currentY = snapPointsPixels[currentSnapIndex.current] + gestureState.dy;
        const velocity = gestureState.vy;

        // Find the nearest snap point
        let targetIndex = currentSnapIndex.current;

        if (velocity > 0.5) {
          // Swiping down - go to lower snap point
          targetIndex = Math.max(0, currentSnapIndex.current - 1);
        } else if (velocity < -0.5) {
          // Swiping up - go to higher snap point
          targetIndex = Math.min(snapPointsPixels.length - 1, currentSnapIndex.current + 1);
        } else {
          // Find nearest snap point based on position
          let minDistance = Infinity;
          snapPointsPixels.forEach((point, index) => {
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
      ]}
    >
      {/* Floating Button (positioned above the sheet) */}
      {floatingButton && (
        <View style={styles.floatingButtonContainer}>
          {floatingButton}
        </View>
      )}

      {/* Handle */}
      <View {...panResponder.panHandlers} style={styles.handleContainer}>
        <View style={styles.handle} />
      </View>

      {/* Content */}
      <View style={[
        styles.content,
        isKeyboardVisible && { paddingBottom: keyboardHeight }
      ]}>
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
    paddingVertical: 12,
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
