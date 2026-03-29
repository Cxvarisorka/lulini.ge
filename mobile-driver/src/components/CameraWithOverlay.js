import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Dimensions,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, useTypography } from '../theme/colors';

let CameraView = null;
try {
  CameraView = require('expo-camera').CameraView;
} catch (_) {}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Overlay configs per document type
const OVERLAY_CONFIGS = {
  licenseFront: {
    aspectRatio: 1.586, // standard ID card ratio
    icon: 'card-outline',
    facing: 'back',
    isOval: false,
  },
  licenseBack: {
    aspectRatio: 1.586,
    icon: 'card-outline',
    facing: 'back',
    isOval: false,
  },
  driverLicense: {
    aspectRatio: 1.586,
    icon: 'card-outline',
    facing: 'back',
    isOval: false,
  },
  profilePhoto: {
    aspectRatio: 0.75, // portrait oval
    icon: 'person-outline',
    facing: 'front',
    isOval: true,
  },
};

/**
 * Full-screen camera with overlay guide for documents / face.
 *
 * Props:
 *   overlayType  — 'licenseFront' | 'licenseBack' | 'driverLicense' | 'profilePhoto'
 *   onCapture({ uri })
 *   onClose()
 */
export default function CameraWithOverlay({ overlayType, onCapture, onClose }) {
  const { t } = useTranslation();
  const typography = useTypography();
  const styles = useMemo(() => createStyles(typography), [typography]);
  const cameraRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const config = OVERLAY_CONFIGS[overlayType] || OVERLAY_CONFIGS.licenseFront;

  // --- Cutout dimensions ---
  const PADDING = 32;
  let cutoutW, cutoutH;

  if (config.isOval) {
    cutoutW = SCREEN_W * 0.6;
    cutoutH = cutoutW / config.aspectRatio;
  } else {
    cutoutW = SCREEN_W - PADDING * 2;
    cutoutH = cutoutW / config.aspectRatio;
  }

  // Center of cutout — slightly above screen center to leave room for button
  const cutoutCenterY = SCREEN_H * 0.42;
  const cutoutTop = cutoutCenterY - cutoutH / 2;
  const cutoutLeft = (SCREEN_W - cutoutW) / 2;

  // Instruction text positioned above the cutout
  const instructionY = cutoutTop - 52;

  if (!CameraView) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Camera not available</Text>
        <TouchableOpacity onPress={onClose} style={styles.fallbackBtn}>
          <Text style={styles.fallbackBtnText}>{t('common.close')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleCapture = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: Platform.OS === 'android',
      });
      onCapture?.({ uri: photo.uri });
    } catch (err) {
      console.warn('[Camera] Capture error:', err);
    } finally {
      setCapturing(false);
    }
  };

  const instruction = t(
    `camera.overlay.${overlayType}`,
    getDefaultInstruction(overlayType),
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={config.facing}
        onCameraReady={() => setReady(true)}
      />

      {/* ---- Dark overlay (4 rects for card, full overlay for oval) ---- */}
      {config.isOval ? (
        <View style={[StyleSheet.absoluteFill, styles.overlayFull]} pointerEvents="none">
          {/* Oval dashed border as the guide */}
          <View
            style={[
              styles.ovalGuide,
              {
                width: cutoutW,
                height: cutoutH,
                borderRadius: cutoutW / 2,
                top: cutoutTop,
                left: cutoutLeft,
              },
            ]}
          />
        </View>
      ) : (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* Top */}
          <View style={[styles.overlayRect, { top: 0, left: 0, right: 0, height: cutoutTop }]} />
          {/* Bottom */}
          <View style={[styles.overlayRect, { top: cutoutTop + cutoutH, left: 0, right: 0, bottom: 0 }]} />
          {/* Left */}
          <View style={[styles.overlayRect, { top: cutoutTop, left: 0, width: cutoutLeft, height: cutoutH }]} />
          {/* Right */}
          <View style={[styles.overlayRect, { top: cutoutTop, right: 0, width: cutoutLeft, height: cutoutH }]} />
        </View>
      )}

      {/* ---- Cutout border ---- */}
      <View
        style={[
          styles.cutoutBorder,
          {
            width: cutoutW,
            height: cutoutH,
            top: cutoutTop,
            left: cutoutLeft,
            borderRadius: config.isOval ? cutoutW / 2 : 12,
          },
        ]}
        pointerEvents="none"
      />

      {/* ---- Corner guides (cards only) ---- */}
      {!config.isOval && (
        <View
          style={{ position: 'absolute', top: cutoutTop, left: cutoutLeft, width: cutoutW, height: cutoutH }}
          pointerEvents="none"
        >
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
      )}

      {/* ---- Top bar (close button) ---- */}
      <SafeAreaView style={styles.topBar}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          accessibilityLabel={t('common.close')}
        >
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
      </SafeAreaView>

      {/* ---- Instruction badge ---- */}
      <View style={[styles.instructionWrap, { top: instructionY }]} pointerEvents="none">
        <View style={styles.instructionBadge}>
          <Ionicons name={config.icon} size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.instructionText}>{instruction}</Text>
        </View>
      </View>

      {/* ---- Bottom capture button ---- */}
      <SafeAreaView style={styles.bottomBar}>
        <View style={styles.captureRow}>
          <TouchableOpacity
            style={[styles.captureBtn, (!ready || capturing) && styles.captureBtnDisabled]}
            onPress={handleCapture}
            disabled={!ready || capturing}
            accessibilityLabel={t('camera.capture', 'Take photo')}
            accessibilityRole="button"
          >
            <View style={styles.captureBtnInner} />
          </TouchableOpacity>
        </View>
        <Text style={styles.hintText}>
          {config.isOval
            ? t('camera.hintFace', 'Make sure your face is clearly visible and well-lit')
            : t('camera.hintCard', 'Keep the card flat and avoid glare')}
        </Text>
      </SafeAreaView>
    </View>
  );
}

function getDefaultInstruction(type) {
  switch (type) {
    case 'licenseFront':
      return 'Position the FRONT of your license in the frame';
    case 'licenseBack':
      return 'Position the BACK of your license in the frame';
    case 'driverLicense':
      return 'Position your license in the frame';
    case 'profilePhoto':
      return 'Position your face in the oval';
    default:
      return 'Position the document in the frame';
  }
}

const createStyles = (typography) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    fallback: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
    fallbackText: { ...typography.body, color: '#fff', marginBottom: 20 },
    fallbackBtn: { paddingHorizontal: 24, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: radius.lg },
    fallbackBtnText: { ...typography.button, color: '#fff' },

    // Overlay
    overlayRect: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
    overlayFull: { backgroundColor: 'rgba(0,0,0,0.55)' },
    ovalGuide: {
      position: 'absolute',
      backgroundColor: 'rgba(0,0,0,0)', // transparent hole effect
      borderWidth: 0,
    },

    // Cutout border
    cutoutBorder: {
      position: 'absolute',
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.85)',
      borderStyle: 'dashed',
    },

    // Corner accents
    corner: { position: 'absolute', width: 28, height: 28, borderColor: '#fff' },
    cornerTL: { top: -1, left: -1, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 },
    cornerTR: { top: -1, right: -1, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 },
    cornerBL: { bottom: -1, left: -1, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 },
    cornerBR: { bottom: -1, right: -1, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 },

    // Top bar
    topBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
    closeBtn: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center', alignItems: 'center',
      marginLeft: 16, marginTop: Platform.OS === 'android' ? 12 : 8,
    },

    // Instruction
    instructionWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 10 },
    instructionBadge: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.65)',
      paddingHorizontal: 16, paddingVertical: 10,
      borderRadius: radius.full,
    },
    instructionText: { ...typography.bodySmall, color: '#fff', fontWeight: '600' },

    // Bottom
    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 },
    captureRow: { alignItems: 'center', paddingBottom: 8 },
    captureBtn: {
      width: 72, height: 72, borderRadius: 36,
      borderWidth: 4, borderColor: '#fff',
      justifyContent: 'center', alignItems: 'center',
    },
    captureBtnDisabled: { opacity: 0.4 },
    captureBtnInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
    hintText: {
      ...typography.captionSmall, color: 'rgba(255,255,255,0.7)',
      textAlign: 'center', paddingHorizontal: 32, paddingBottom: 20,
    },
  });
