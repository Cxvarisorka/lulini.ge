import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { colors, shadows, radius, useTypography } from '../theme/colors';
import { driverAPI } from '../services/api';
import CameraWithOverlay from './CameraWithOverlay';

// expo-image-picker must be installed: npx expo install expo-image-picker
let ImagePicker = null;
try {
  ImagePicker = require('expo-image-picker');
} catch (_) {
  // expo-image-picker not installed — upload buttons will be disabled
}

const FILE_SIZE_LIMIT_MB = 10;
const FILE_SIZE_LIMIT_BYTES = FILE_SIZE_LIMIT_MB * 1024 * 1024;

// Status badge colors
const STATUS_COLORS = {
  pending:  { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
  approved: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
  rejected: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  none:     { bg: colors.muted,  text: colors.mutedForeground, border: colors.border },
};

/**
 * DocumentUpload
 *
 * Props:
 *   type         {string}   — document type key sent to server
 *   overlayType  {string}   — overlay guide: 'licenseFront' | 'licenseBack' | 'profilePhoto' (optional)
 *   label        {string}
 *   description  {string}
 *   status       {string}   — 'none' | 'pending' | 'approved' | 'rejected'
 *   uri          {string}
 *   onUploaded   {function}
 */
export default function DocumentUpload({
  type,
  overlayType,
  label,
  description,
  status = 'none',
  uri: initialUri = null,
  onUploaded,
}) {
  const { t } = useTranslation();
  const typography = useTypography();
  const styles = useMemo(() => createStyles(typography), [typography]);

  const [uri, setUri] = useState(initialUri);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentStatus, setCurrentStatus] = useState(status);
  const [showCamera, setShowCamera] = useState(false);

  // Keep in sync if parent changes status (e.g. after polling)
  React.useEffect(() => { setCurrentStatus(status); }, [status]);
  React.useEffect(() => { setUri(initialUri); }, [initialUri]);

  const requestPermissions = async () => {
    if (!ImagePicker) return false;
    if (Platform.OS !== 'web') {
      const { status: camStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (camStatus !== 'granted') {
        Alert.alert(
          t('common.error'),
          t('onboarding.permissions.galleryDenied', 'Gallery access is required to upload documents.')
        );
        return false;
      }
    }
    return true;
  };

  const pickImage = async (useCamera) => {
    // If overlayType is set and user wants camera, open custom camera with guide overlay
    if (useCamera && overlayType) {
      const { status: camStatus } = await (ImagePicker
        ? ImagePicker.requestCameraPermissionsAsync()
        : Promise.resolve({ status: 'undetermined' }));
      if (camStatus !== 'granted') {
        // Try expo-camera permissions
        try {
          const { Camera } = require('expo-camera');
          const { status: camStatus2 } = await Camera.requestCameraPermissionsAsync();
          if (camStatus2 !== 'granted') {
            Alert.alert(t('common.error'), t('onboarding.permissions.cameraDenied', 'Camera access is required.'));
            return;
          }
        } catch (_) {
          Alert.alert(t('common.error'), t('onboarding.permissions.cameraDenied', 'Camera access is required.'));
          return;
        }
      }
      setShowCamera(true);
      return;
    }

    if (!ImagePicker) {
      Alert.alert(
        t('common.error'),
        'expo-image-picker is not installed. Run: npx expo install expo-image-picker'
      );
      return;
    }

    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      let result;
      if (useCamera) {
        const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
        if (camStatus !== 'granted') {
          Alert.alert(t('common.error'), t('onboarding.permissions.cameraDenied', 'Camera access is required.'));
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          quality: 0.8,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          quality: 0.8,
        });
      }

      if (!result.canceled && result.assets?.length > 0) {
        const asset = result.assets[0];

        // File size guard
        if (asset.fileSize && asset.fileSize > FILE_SIZE_LIMIT_BYTES) {
          Alert.alert(
            t('common.error'),
            t('documents.fileTooLarge', { size: FILE_SIZE_LIMIT_MB }, `File exceeds ${FILE_SIZE_LIMIT_MB}MB limit.`)
          );
          return;
        }

        await uploadDocument(asset);
      }
    } catch (err) {
      Alert.alert(t('common.error'), t('errors.somethingWentWrong'));
    }
  };

  const handleCameraCapture = async ({ uri: photoUri }) => {
    setShowCamera(false);
    await uploadDocument({ uri: photoUri });
  };

  const uploadDocument = async (asset) => {
    setUploading(true);
    setUploadProgress(0);

    try {
      const filename = asset.uri.split('/').pop();
      const match = /\.(\w+)$/.exec(filename);
      const mimeType = match ? `image/${match[1].toLowerCase()}` : 'image/jpeg';

      const formData = new FormData();
      formData.append('document', {
        uri: asset.uri,
        name: filename || `${type}.jpg`,
        type: mimeType,
      });

      // Simulate progress — axios doesn't expose upload progress easily in RN
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 15, 85));
      }, 200);

      await driverAPI.uploadDocument(type, formData);

      clearInterval(progressInterval);
      setUploadProgress(100);
      setUri(asset.uri);
      setCurrentStatus('pending');

      onUploaded?.({ type, uri: asset.uri, status: 'pending' });
    } catch (err) {
      Alert.alert(
        t('common.error'),
        err.response?.data?.message || t('documents.uploadFailed', 'Upload failed. Please try again.')
      );
      setCurrentStatus(uri ? 'pending' : 'none');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const showPickerOptions = () => {
    Alert.alert(
      t('documents.chooseSource', 'Choose Source'),
      '',
      [
        {
          text: t('documents.camera', 'Camera'),
          onPress: () => pickImage(true),
        },
        {
          text: t('documents.gallery', 'Gallery'),
          onPress: () => pickImage(false),
        },
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
      ]
    );
  };

  const statusConfig = STATUS_COLORS[currentStatus] || STATUS_COLORS.none;
  const statusLabel = t(`documents.status.${currentStatus}`, currentStatus);
  const isApproved = currentStatus === 'approved';

  return (
    <View style={styles.container} accessibilityLabel={label}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={styles.labelContainer}>
          <Ionicons
            name={getDocumentIcon(type)}
            size={20}
            color={colors.primary}
            style={styles.labelIcon}
          />
          <View>
            <Text style={styles.label}>{label}</Text>
            {description ? (
              <Text style={styles.description}>{description}</Text>
            ) : null}
          </View>
        </View>

        {/* Status badge */}
        {currentStatus !== 'none' && (
          <View style={[styles.statusBadge, {
            backgroundColor: statusConfig.bg,
            borderColor: statusConfig.border,
          }]}>
            <Text style={[styles.statusText, { color: statusConfig.text }]}>
              {statusLabel}
            </Text>
          </View>
        )}
      </View>

      {/* Preview or placeholder */}
      <TouchableOpacity
        style={[styles.uploadArea, uri && styles.uploadAreaWithImage, isApproved && styles.uploadAreaApproved]}
        onPress={isApproved ? undefined : showPickerOptions}
        disabled={uploading || isApproved}
        accessibilityLabel={t('documents.uploadAreaLabel', { label })}
        accessibilityRole="button"
        accessibilityState={{ disabled: uploading || isApproved }}
      >
        {uploading ? (
          <View style={styles.uploadingContainer}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.uploadingText}>
              {t('documents.uploading', 'Uploading...')} {uploadProgress > 0 ? `${uploadProgress}%` : ''}
            </Text>
            {/* Progress bar */}
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBar, { width: `${uploadProgress}%` }]} />
            </View>
          </View>
        ) : uri ? (
          <View style={styles.previewContainer}>
            <Image source={{ uri }} style={styles.previewImage} resizeMode="cover" />
            {!isApproved && (
              <View style={styles.previewOverlay}>
                <Ionicons name="camera" size={22} color="#fff" />
                <Text style={styles.previewOverlayText}>
                  {t('documents.tapToChange', 'Tap to replace')}
                </Text>
              </View>
            )}
            {isApproved && (
              <View style={styles.approvedBadgeOverlay}>
                <Ionicons name="checkmark-circle" size={32} color={colors.success} />
              </View>
            )}
          </View>
        ) : (
          <View style={styles.placeholderContainer}>
            <Ionicons name="cloud-upload-outline" size={36} color={colors.mutedForeground} />
            <Text style={styles.placeholderText}>
              {t('documents.tapToUpload', 'Tap to upload')}
            </Text>
            <Text style={styles.placeholderHint}>
              {t('documents.sizeLimit', { size: FILE_SIZE_LIMIT_MB }, `Max ${FILE_SIZE_LIMIT_MB}MB`)}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Rejected message */}
      {currentStatus === 'rejected' && (
        <View style={styles.rejectedRow}>
          <Ionicons name="alert-circle" size={14} color={colors.destructive} />
          <Text style={styles.rejectedText}>
            {t('documents.rejectedHint', 'Document rejected. Please upload a clearer image.')}
          </Text>
        </View>
      )}

      {/* Camera overlay modal */}
      {overlayType && (
        <Modal visible={showCamera} animationType="slide" statusBarTranslucent>
          <CameraWithOverlay
            overlayType={overlayType}
            onCapture={handleCameraCapture}
            onClose={() => setShowCamera(false)}
          />
        </Modal>
      )}
    </View>
  );
}

function getDocumentIcon(type) {
  switch (type) {
    case 'license':
    case 'driverLicense':
    case 'licenseFront':
    case 'licenseBack': return 'card-outline';
    case 'profilePhoto': return 'person-circle-outline';
    case 'registration': return 'document-text-outline';
    case 'insurance': return 'shield-checkmark-outline';
    case 'front':
    case 'back':
    case 'left':
    case 'right': return 'car-outline';
    case 'inside': return 'car-sport-outline';
    default: return 'camera-outline';
  }
}

const createStyles = (typography) => StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  labelIcon: {
    marginRight: 4,
  },
  label: {
    ...typography.bodyMedium,
    color: colors.foreground,
    fontWeight: '600',
  },
  description: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
    marginLeft: 8,
  },
  statusText: {
    ...typography.captionSmall,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  uploadArea: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.muted,
    overflow: 'hidden',
  },
  uploadAreaWithImage: {
    borderStyle: 'solid',
    borderColor: colors.border,
    minHeight: 160,
  },
  uploadAreaApproved: {
    borderColor: colors.success,
    borderStyle: 'solid',
  },
  uploadingContainer: {
    alignItems: 'center',
    padding: 20,
    width: '100%',
  },
  uploadingText: {
    ...typography.caption,
    color: colors.mutedForeground,
    marginTop: 10,
  },
  progressBarContainer: {
    width: '80%',
    height: 4,
    backgroundColor: colors.border,
    borderRadius: radius.full,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  previewContainer: {
    width: '100%',
    height: 160,
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 6,
  },
  previewOverlayText: {
    ...typography.captionSmall,
    color: '#fff',
    fontWeight: '600',
  },
  approvedBadgeOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#fff',
    borderRadius: radius.full,
  },
  placeholderContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  placeholderText: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginTop: 8,
  },
  placeholderHint: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    marginTop: 4,
  },
  rejectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  rejectedText: {
    ...typography.captionSmall,
    color: colors.destructive,
    flex: 1,
  },
});
