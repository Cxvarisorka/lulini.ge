import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';

import { driverAPI, authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { colors, shadows, radius, useTypography } from '../theme/colors';
import DocumentUpload from '../components/DocumentUpload';

// ─── Constants ─────────────────────────────────────────────────────────────

const STEPS = ['welcome', 'phone', 'vehicle', 'photos', 'permissions', 'terms', 'pending'];
const TOTAL_STEPS = STEPS.length;

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1990;
const ONBOARDING_CACHE_KEY = '@driver_onboarding_cache';

// Car photo types required for vehicle inspection
const CAR_PHOTO_TYPES = [
  { key: 'front', icon: 'car-outline', labelKey: 'onboarding.photos.front' },
  { key: 'back', icon: 'car-outline', labelKey: 'onboarding.photos.back' },
  { key: 'left', icon: 'car-outline', labelKey: 'onboarding.photos.left' },
  { key: 'right', icon: 'car-outline', labelKey: 'onboarding.photos.right' },
  { key: 'inside', icon: 'car-outline', labelKey: 'onboarding.photos.inside' },
];

// ─── Main Component ────────────────────────────────────────────────────────

export default function OnboardingScreen({ navigation }) {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const { socket } = useSocket();
  const insets = useSafeAreaInsets();
  const typography = useTypography();
  const styles = useMemo(() => createStyles(typography), [typography]);

  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const scrollRef = useRef(null);

  // Phone verification state
  const [phone, setPhone] = useState(user?.phone || '');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(!!user?.isPhoneVerified);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const otpCooldownRef = useRef(null);

  // Vehicle info state (no type — admin assigns after inspection)
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');

  // Photo state — profile photo + license front/back + 5 car photos
  const [photos, setPhotos] = useState({
    profilePhoto: { uri: null, status: 'none' },
    licenseFront: { uri: null, status: 'none' },
    licenseBack: { uri: null, status: 'none' },
    front: { uri: null, status: 'none' },
    back: { uri: null, status: 'none' },
    left: { uri: null, status: 'none' },
    right: { uri: null, status: 'none' },
    inside: { uri: null, status: 'none' },
  });

  // Permissions state
  const [locationGranted, setLocationGranted] = useState(false);
  const [notificationsGranted, setNotificationsGranted] = useState(false);

  // Check current permission status on mount so already-granted permissions show as green
  React.useEffect(() => {
    (async () => {
      try {
        const { status: locStatus } = await Location.getForegroundPermissionsAsync();
        if (locStatus === 'granted') setLocationGranted(true);
      } catch (_) {}
      try {
        const { status: notifStatus } = await Notifications.getPermissionsAsync();
        if (notifStatus === 'granted') setNotificationsGranted(true);
      } catch (_) {}
    })();
  }, []);

  // Terms
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  // ─── Restore cached form data + check onboarding status on mount ─────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      // 1. Restore cached form data
      try {
        const cached = await AsyncStorage.getItem(ONBOARDING_CACHE_KEY);
        if (cached && mounted) {
          const data = JSON.parse(cached);
          if (data.phone) setPhone(data.phone);
          if (data.make) setMake(data.make);
          if (data.model) setModel(data.model);
          if (data.year) setYear(data.year);
          if (data.licensePlate) setLicensePlate(data.licensePlate);
          if (data.vehicleColor) setVehicleColor(data.vehicleColor);
        }
      } catch (_) {}

      // 2. Check if driver profile already exists (submitted previously).
      //    The status endpoint now returns a rich payload: status, rejection
      //    reason, missing documents, etc. Handle each state explicitly so
      //    drivers are not silently stuck on the "pending" screen after a
      //    rejection — they need to see the reason and what to fix.
      try {
        const res = await driverAPI.getOnboardingStatus();
        const data = res.data?.data || {};
        const { hasDriverProfile, isApproved, status, rejectionReason } = data;

        if (!mounted) return;

        if (hasDriverProfile && !isApproved) {
          if (status === 'rejected') {
            // Show the rejection reason and keep the user on the welcome step
            // so they can re-enter the flow after reading what to fix.
            Alert.alert(
              t('onboarding.rejected.title', { defaultValue: 'Application rejected' }),
              rejectionReason || t('onboarding.rejected.genericReason', {
                defaultValue: 'Your application was rejected. Please contact support for details.'
              })
            );
            // Stay on welcome (step 0) so they can restart the flow
          } else {
            // under_review / pending_documents — show the waiting screen
            setCurrentStep(STEPS.indexOf('pending'));
          }
        }
      } catch (_) {}

      if (mounted) setInitialLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  // ─── Listen for admin approval / rejection via Socket.io ────────────────
  // The server emits `driver:approved` and `driver:rejected` to the driver's
  // `user:{id}` room the moment an admin reviews the application. Reacting
  // here lets us advance the onboarding screen without waiting for the user
  // to manually refresh — critical for a smooth post-review experience.
  useEffect(() => {
    if (!socket) return;

    const onApproved = () => {
      // Promote locally so subsequent screens (Home) render in the approved state
      updateUser({ role: 'driver' });
      Alert.alert(
        t('onboarding.approvedAlert.title', { defaultValue: 'Approved!' }),
        t('onboarding.approvedAlert.body', {
          defaultValue: 'Your driver application has been approved. Welcome to Lulini!'
        })
      );
      // The root navigator will route drivers to HomeScreen based on `role`.
    };

    const onRejected = (payload) => {
      Alert.alert(
        t('onboarding.rejected.title', { defaultValue: 'Application rejected' }),
        payload?.reason || t('onboarding.rejected.genericReason', {
          defaultValue: 'Your application was rejected. Please contact support for details.'
        })
      );
      setCurrentStep(0);
    };

    socket.on('driver:approved', onApproved);
    socket.on('driver:rejected', onRejected);
    return () => {
      socket.off('driver:approved', onApproved);
      socket.off('driver:rejected', onRejected);
    };
  }, [socket, updateUser, t]);

  // ─── Cache form data whenever fields change ──────────────────────────────
  const cacheTimeoutRef = useRef(null);
  useEffect(() => {
    // Debounce writes to AsyncStorage
    if (cacheTimeoutRef.current) clearTimeout(cacheTimeoutRef.current);
    cacheTimeoutRef.current = setTimeout(() => {
      const data = { phone, make, model, year, licensePlate, vehicleColor };
      AsyncStorage.setItem(ONBOARDING_CACHE_KEY, JSON.stringify(data)).catch(() => {});
    }, 500);
    return () => { if (cacheTimeoutRef.current) clearTimeout(cacheTimeoutRef.current); };
  }, [phone, make, model, year, licensePlate, vehicleColor]);

  const stepName = STEPS[currentStep];

  // ─── Navigation ────────────────────────────────────────────────────────

  const scrollToTop = () => scrollRef.current?.scrollTo({ y: 0, animated: true });

  const goNext = useCallback(() => {
    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep((s) => s + 1);
      scrollToTop();
    }
  }, [currentStep]);

  const goBack = useCallback(() => {
    if (currentStep > 0 && currentStep < TOTAL_STEPS - 1) {
      setCurrentStep((s) => s - 1);
      scrollToTop();
    }
  }, [currentStep]);

  // ─── Step validation ────────────────────────────────────────────────────

  const validateVehicle = () => {
    if (!make.trim()) {
      Alert.alert(t('common.error'), t('onboarding.vehicle.makeRequired'));
      return false;
    }
    if (!model.trim()) {
      Alert.alert(t('common.error'), t('onboarding.vehicle.modelRequired'));
      return false;
    }
    const yearNum = parseInt(year, 10);
    if (!year || isNaN(yearNum) || yearNum < MIN_YEAR || yearNum > CURRENT_YEAR + 1) {
      Alert.alert(t('common.error'), t('onboarding.vehicle.yearInvalid', { min: MIN_YEAR, max: CURRENT_YEAR + 1 }));
      return false;
    }
    if (!licensePlate.trim()) {
      Alert.alert(t('common.error'), t('onboarding.vehicle.plateRequired'));
      return false;
    }
    if (!vehicleColor.trim()) {
      Alert.alert(t('common.error'), t('onboarding.vehicle.colorRequired'));
      return false;
    }
    return true;
  };

  const validatePhotos = () => {
    // Profile photo is required
    if (!photos.profilePhoto.uri) {
      Alert.alert(t('common.error'), t('onboarding.photos.profileRequired'));
      return false;
    }
    // License front and back are required
    if (!photos.licenseFront.uri) {
      Alert.alert(t('common.error'), t('onboarding.photos.licenseFrontRequired'));
      return false;
    }
    if (!photos.licenseBack.uri) {
      Alert.alert(t('common.error'), t('onboarding.photos.licenseBackRequired'));
      return false;
    }
    // All 5 car photos are required
    const missingPhotos = CAR_PHOTO_TYPES.filter((p) => !photos[p.key].uri);
    if (missingPhotos.length > 0) {
      Alert.alert(t('common.error'), t('onboarding.photos.allRequired'));
      return false;
    }
    return true;
  };

  const validateTerms = () => {
    if (!termsAccepted || !privacyAccepted) {
      Alert.alert(t('common.error'), t('onboarding.terms.mustAcceptBoth'));
      return false;
    }
    return true;
  };

  // ─── Phone verification handlers ─────────────────────────────────────────

  const startOtpCooldown = (seconds = 60) => {
    setOtpCooldown(seconds);
    if (otpCooldownRef.current) clearInterval(otpCooldownRef.current);
    otpCooldownRef.current = setInterval(() => {
      setOtpCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(otpCooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  React.useEffect(() => {
    return () => { if (otpCooldownRef.current) clearInterval(otpCooldownRef.current); };
  }, []);

  const handleSendOtp = async () => {
    const trimmedPhone = phone.trim();
    if (!trimmedPhone || !/^\+?[0-9\s\-()]{7,20}$/.test(trimmedPhone)) {
      Alert.alert(t('common.error'), t('onboarding.phone.invalidPhone'));
      return;
    }
    setLoading(true);
    try {
      // Use the authenticated update-otp endpoint (user is already logged in)
      await authAPI.sendPhoneUpdateOtp({ phone: trimmedPhone });
      setOtpSent(true);
      startOtpCooldown(60);
      Alert.alert(t('common.success'), t('onboarding.phone.otpSent'));
    } catch (err) {
      Alert.alert(t('common.error'), err.response?.data?.message || t('errors.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.length < 4) {
      Alert.alert(t('common.error'), t('onboarding.phone.invalidOtp'));
      return;
    }
    setLoading(true);
    try {
      await authAPI.verifyPhoneUpdateOtp({ phone: phone.trim(), code: otpCode });
      setPhoneVerified(true);
      await updateUser({ phone: phone.trim(), isPhoneVerified: true });
      goNext();
    } catch (err) {
      Alert.alert(t('common.error'), err.response?.data?.message || t('onboarding.phone.verifyFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneNext = () => {
    if (phoneVerified) {
      goNext();
      return;
    }
    if (!otpSent) {
      handleSendOtp();
    } else {
      handleVerifyOtp();
    }
  };

  // ─── Step submission handlers ────────────────────────────────────────────

  const handleVehicleNext = async () => {
    if (!validateVehicle()) return;

    setLoading(true);
    try {
      await driverAPI.registerDriver({
        vehicleMake: make.trim(),
        vehicleModel: model.trim(),
        vehicleYear: parseInt(year, 10),
        licensePlate: licensePlate.trim().toUpperCase(),
        vehicleColor: vehicleColor.trim(),
      });
      goNext();
    } catch (err) {
      // If the driver profile already exists (409), just continue to next step
      if (err.response?.status === 409) {
        goNext();
        return;
      }
      Alert.alert(
        t('common.error'),
        err.response?.data?.message || t('errors.somethingWentWrong')
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePhotosNext = () => {
    if (!validatePhotos()) return;
    goNext();
  };

  const handlePermissions = async () => {
    let locOk = locationGranted;
    let notifOk = notificationsGranted;

    if (!locOk) {
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus === 'granted') {
        await Location.requestBackgroundPermissionsAsync();
        locOk = true;
        setLocationGranted(true);
      }
    }

    if (!notifOk) {
      const { status: notifStatus } = await Notifications.requestPermissionsAsync();
      if (notifStatus === 'granted') {
        notifOk = true;
        setNotificationsGranted(true);
      }
    }

    if (!locOk) {
      Alert.alert(
        t('onboarding.permissions.locationRequired'),
        t('onboarding.permissions.locationRequiredDesc'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.continue'), onPress: goNext },
        ]
      );
    } else {
      goNext();
    }
  };

  const handleTermsNext = async () => {
    if (!validateTerms()) return;
    // Clear cached form data — onboarding is complete, now waiting for approval
    AsyncStorage.removeItem(ONBOARDING_CACHE_KEY).catch(() => {});
    goNext();
  };

  const handleFinish = async () => {
    // Check if the driver has been approved by re-fetching the user profile
    setLoading(true);
    try {
      const { authAPI } = require('../services/api');
      const response = await authAPI.getMe();
      const freshUser = response.data?.data?.user;
      if (freshUser?.role === 'driver') {
        // Approved! Update local user and navigator will route to main tabs
        await updateUser(freshUser);
      } else {
        Alert.alert(
          t('onboarding.pending.notYetApproved'),
          t('onboarding.pending.notYetApprovedDesc')
        );
      }
    } catch (err) {
      Alert.alert(t('common.error'), t('errors.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  // ─── Step action dispatching ─────────────────────────────────────────────

  const handlePrimaryAction = () => {
    switch (stepName) {
      case 'welcome':      return goNext();
      case 'phone':        return handlePhoneNext();
      case 'vehicle':      return handleVehicleNext();
      case 'photos':       return handlePhotosNext();
      case 'permissions':  return handlePermissions();
      case 'terms':        return handleTermsNext();
      case 'pending':      return handleFinish();
      default:             return goNext();
    }
  };

  const handlePhotoUploaded = useCallback(({ type, uri }) => {
    setPhotos((prev) => ({ ...prev, [type]: { uri, status: 'pending' } }));
  }, []);

  // ─── Step renderers ──────────────────────────────────────────────────────

  const renderWelcome = () => (
    <View style={styles.stepContent}>
      <View style={styles.illustrationContainer}>
        <Ionicons name="car-sport" size={80} color={colors.primary} />
      </View>
      <Text style={styles.stepTitle} accessibilityRole="header">
        {t('onboarding.welcome.title')}
      </Text>
      <Text style={styles.stepSubtitle}>{t('onboarding.welcome.subtitle')}</Text>

      <View style={styles.benefitsList}>
        {['earn', 'flexible', 'support', 'instant'].map((key) => (
          <View key={key} style={styles.benefitRow}>
            <View style={styles.benefitIcon}>
              <Ionicons name={BENEFIT_ICONS[key]} size={20} color={colors.primary} />
            </View>
            <View style={styles.benefitText}>
              <Text style={styles.benefitTitle}>{t(`onboarding.welcome.benefits.${key}.title`)}</Text>
              <Text style={styles.benefitDesc}>{t(`onboarding.welcome.benefits.${key}.desc`)}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  const renderPhone = () => (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.stepContent}>
        <View style={styles.illustrationContainer}>
          <Ionicons name="call" size={72} color={colors.primary} />
        </View>
        <Text style={styles.stepTitle} accessibilityRole="header">
          {t('onboarding.phone.title')}
        </Text>
        <Text style={styles.stepSubtitle}>{t('onboarding.phone.subtitle')}</Text>

        {phoneVerified ? (
          <View style={styles.phoneVerifiedCard}>
            <Ionicons name="checkmark-circle" size={24} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.phoneVerifiedText, { ...typography.bodyMedium }]}>{phone}</Text>
              <Text style={[styles.phoneVerifiedLabel, { ...typography.captionSmall }]}>
                {t('onboarding.phone.verified')}
              </Text>
            </View>
          </View>
        ) : (
          <>
            {/* Phone input */}
            <FieldInput
              icon="call-outline"
              placeholder={t('onboarding.phone.placeholder')}
              value={phone}
              onChangeText={(val) => { setPhone(val); setOtpSent(false); setOtpCode(''); }}
              keyboardType="phone-pad"
              styles={styles}
              typography={typography}
              editable={!loading && !otpSent}
            />

            {otpSent && (
              <>
                <Text style={[styles.otpHint, { ...typography.bodySmall }]}>
                  {t('onboarding.phone.enterCode')}
                </Text>
                <FieldInput
                  icon="key-outline"
                  placeholder={t('onboarding.phone.codePlaceholder')}
                  value={otpCode}
                  onChangeText={setOtpCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  styles={styles}
                  typography={typography}
                  editable={!loading}
                />
                {/* Resend */}
                <TouchableOpacity
                  onPress={handleSendOtp}
                  disabled={otpCooldown > 0 || loading}
                  style={styles.resendButton}
                  accessibilityLabel={t('onboarding.phone.resend')}
                  accessibilityRole="button"
                >
                  <Text style={[
                    styles.resendText,
                    { ...typography.caption },
                    otpCooldown > 0 && { color: colors.mutedForeground }
                  ]}>
                    {otpCooldown > 0
                      ? t('onboarding.phone.resendIn', { seconds: otpCooldown })
                      : t('onboarding.phone.resend')}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );

  const renderVehicle = () => (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle} accessibilityRole="header">
          {t('onboarding.vehicle.title')}
        </Text>
        <Text style={styles.stepSubtitle}>{t('onboarding.vehicle.subtitle')}</Text>

        {/* Make */}
        <FieldInput
          icon="car-outline"
          placeholder={t('onboarding.vehicle.make')}
          value={make}
          onChangeText={setMake}
          autoCapitalize="words"
          styles={styles}
          typography={typography}
          editable={!loading}
        />

        {/* Model */}
        <FieldInput
          icon="car-outline"
          placeholder={t('onboarding.vehicle.model')}
          value={model}
          onChangeText={setModel}
          autoCapitalize="words"
          styles={styles}
          typography={typography}
          editable={!loading}
        />

        {/* Year */}
        <FieldInput
          icon="calendar-outline"
          placeholder={t('onboarding.vehicle.year')}
          value={year}
          onChangeText={setYear}
          keyboardType="number-pad"
          maxLength={4}
          styles={styles}
          typography={typography}
          editable={!loading}
        />

        {/* License plate */}
        <FieldInput
          icon="id-card-outline"
          placeholder={t('onboarding.vehicle.licensePlate')}
          value={licensePlate}
          onChangeText={setLicensePlate}
          autoCapitalize="characters"
          styles={styles}
          typography={typography}
          editable={!loading}
        />

        {/* Color */}
        <FieldInput
          icon="color-palette-outline"
          placeholder={t('onboarding.vehicle.color')}
          value={vehicleColor}
          onChangeText={setVehicleColor}
          autoCapitalize="words"
          styles={styles}
          typography={typography}
          editable={!loading}
        />
      </View>
    </KeyboardAvoidingView>
  );

  const renderPhotos = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle} accessibilityRole="header">
        {t('onboarding.photos.title')}
      </Text>
      <Text style={styles.stepSubtitle}>{t('onboarding.photos.subtitle')}</Text>

      {/* Profile Photo */}
      <Text style={styles.sectionLabel}>{t('onboarding.photos.profileSection')}</Text>
      <Text style={styles.sectionHint}>{t('onboarding.photos.profileHint')}</Text>
      <DocumentUpload
        type="profilePhoto"
        overlayType="profilePhoto"
        label={t('onboarding.photos.profilePhoto')}
        description={t('onboarding.photos.profilePhotoDesc')}
        status={photos.profilePhoto.status}
        uri={photos.profilePhoto.uri}
        onUploaded={handlePhotoUploaded}
      />

      {/* Driver License — Front & Back */}
      <Text style={[styles.sectionLabel, { marginTop: 24 }]}>{t('onboarding.photos.driverLicenseSection')}</Text>
      <Text style={styles.sectionHint}>{t('onboarding.photos.licenseHint')}</Text>
      <DocumentUpload
        type="licenseFront"
        overlayType="licenseFront"
        label={t('onboarding.photos.licenseFront')}
        description={t('onboarding.photos.licenseFrontDesc')}
        status={photos.licenseFront.status}
        uri={photos.licenseFront.uri}
        onUploaded={handlePhotoUploaded}
      />
      <DocumentUpload
        type="licenseBack"
        overlayType="licenseBack"
        label={t('onboarding.photos.licenseBack')}
        description={t('onboarding.photos.licenseBackDesc')}
        status={photos.licenseBack.status}
        uri={photos.licenseBack.uri}
        onUploaded={handlePhotoUploaded}
      />

      {/* Car Photos */}
      <Text style={[styles.sectionLabel, { marginTop: 24 }]}>{t('onboarding.photos.carPhotosSection')}</Text>
      <Text style={styles.sectionHint}>{t('onboarding.photos.carPhotosHint')}</Text>

      {CAR_PHOTO_TYPES.map((photo) => (
        <DocumentUpload
          key={photo.key}
          type={photo.key}
          label={t(photo.labelKey)}
          description={t(`onboarding.photos.${photo.key}Desc`)}
          status={photos[photo.key].status}
          uri={photos[photo.key].uri}
          onUploaded={handlePhotoUploaded}
        />
      ))}
    </View>
  );

  const renderPermissions = () => (
    <View style={styles.stepContent}>
      <View style={styles.illustrationContainer}>
        <Ionicons name="shield-checkmark" size={72} color={colors.primary} />
      </View>
      <Text style={styles.stepTitle} accessibilityRole="header">
        {t('onboarding.permissions.title')}
      </Text>
      <Text style={styles.stepSubtitle}>{t('onboarding.permissions.subtitle')}</Text>

      <View style={styles.permissionsList}>
        <PermissionRow
          icon="location"
          label={t('onboarding.permissions.location')}
          desc={t('onboarding.permissions.locationDesc')}
          granted={locationGranted}
          onRequest={async () => {
            try {
              const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
              if (fgStatus === 'granted') {
                setLocationGranted(true);
                // Background permission is optional — request but don't block on it
                Location.requestBackgroundPermissionsAsync().catch(() => {});
              }
            } catch (_) {}
          }}
          styles={styles}
          typography={typography}
          t={t}
        />
        <PermissionRow
          icon="notifications"
          label={t('onboarding.permissions.notifications')}
          desc={t('onboarding.permissions.notificationsDesc')}
          granted={notificationsGranted}
          onRequest={async () => {
            const { status } = await Notifications.requestPermissionsAsync();
            if (status === 'granted') setNotificationsGranted(true);
          }}
          styles={styles}
          typography={typography}
          t={t}
        />
      </View>
    </View>
  );

  const renderTerms = () => (
    <View style={styles.stepContent}>
      <View style={styles.illustrationContainer}>
        <Ionicons name="document-text" size={72} color={colors.primary} />
      </View>
      <Text style={styles.stepTitle} accessibilityRole="header">
        {t('onboarding.terms.title')}
      </Text>
      <Text style={styles.stepSubtitle}>{t('onboarding.terms.subtitle')}</Text>

      <View style={styles.termsCard}>
        <Text style={styles.termsText}>{t('onboarding.terms.summary')}</Text>
      </View>

      <CheckboxRow
        label={t('onboarding.terms.acceptTerms')}
        linkLabel={t('settings.termsOfService')}
        checked={termsAccepted}
        onToggle={() => setTermsAccepted((v) => !v)}
        styles={styles}
        typography={typography}
      />

      <CheckboxRow
        label={t('onboarding.terms.acceptPrivacy')}
        linkLabel={t('settings.privacyPolicy')}
        checked={privacyAccepted}
        onToggle={() => setPrivacyAccepted((v) => !v)}
        styles={styles}
        typography={typography}
      />
    </View>
  );

  const renderPending = () => (
    <View style={styles.stepContent}>
      <View style={[styles.illustrationContainer, styles.pendingIllustration]}>
        <Ionicons name="time" size={72} color={colors.warning} />
      </View>
      <Text style={styles.stepTitle} accessibilityRole="header">
        {t('onboarding.pending.title')}
      </Text>
      <Text style={styles.stepSubtitle}>{t('onboarding.pending.subtitle')}</Text>

      <View style={styles.pendingStatusCard}>
        <View style={styles.pendingStatusRow}>
          <View style={[styles.pendingStatusDot, { backgroundColor: colors.success }]} />
          <Text style={styles.pendingStatusLabel}>{t('onboarding.pending.profileCreated')}</Text>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
        </View>
        <View style={styles.pendingStatusRow}>
          <View style={[styles.pendingStatusDot, { backgroundColor: colors.success }]} />
          <Text style={styles.pendingStatusLabel}>{t('onboarding.pending.photosUploaded')}</Text>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
        </View>
        <View style={styles.pendingStatusRow}>
          <View style={[styles.pendingStatusDot, { backgroundColor: colors.warning }]} />
          <Text style={styles.pendingStatusLabel}>{t('onboarding.pending.reviewInProgress')}</Text>
          <ActivityIndicator size="small" color={colors.warning} />
        </View>
      </View>

      <Text style={styles.pendingNote}>{t('onboarding.pending.note')}</Text>
    </View>
  );

  const STEP_RENDERERS = {
    welcome:     renderWelcome,
    phone:       renderPhone,
    vehicle:     renderVehicle,
    photos:      renderPhotos,
    permissions: renderPermissions,
    terms:       renderTerms,
    pending:     renderPending,
  };

  const primaryButtonLabel = () => {
    if (stepName === 'pending') return t('onboarding.pending.checkStatus');
    if (stepName === 'permissions') return t('onboarding.permissions.grantAndContinue');
    if (stepName === 'phone') {
      if (phoneVerified) return t('common.continue');
      if (otpSent) return t('onboarding.phone.verifyButton');
      return t('onboarding.phone.sendCode');
    }
    return t('common.continue');
  };

  const showBackButton = currentStep > 0 && currentStep < TOTAL_STEPS - 1;

  if (initialLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Progress bar */}
      <View style={styles.progressBarOuter}>
        <View
          style={[
            styles.progressBarInner,
            { width: `${((currentStep + 1) / TOTAL_STEPS) * 100}%` },
          ]}
        />
      </View>

      {/* Step counter */}
      <View style={styles.stepHeader}>
        {showBackButton ? (
          <TouchableOpacity
            style={styles.backButton}
            onPress={goBack}
            accessibilityLabel={t('common.back')}
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={20} color={colors.foreground} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backButton} />
        )}
        <Text style={styles.stepCounter}>
          {t('onboarding.stepOf', { current: currentStep + 1, total: TOTAL_STEPS })}
        </Text>
        <View style={styles.backButton} />
      </View>

      {/* Step content */}
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {STEP_RENDERERS[stepName]?.()}
      </ScrollView>

      {/* Primary action button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
          onPress={handlePrimaryAction}
          disabled={loading}
          accessibilityLabel={primaryButtonLabel()}
          accessibilityRole="button"
          accessibilityState={{ disabled: loading }}
        >
          {loading ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <>
              <Text style={styles.primaryButtonText}>{primaryButtonLabel()}</Text>
              {stepName !== 'pending' && (
                <Ionicons name="arrow-forward" size={20} color={colors.primaryForeground} />
              )}
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function FieldInput({ icon, placeholder, styles, typography, ...inputProps }) {
  return (
    <View style={styles.inputContainer} accessible accessibilityLabel={placeholder}>
      <Ionicons name={icon} size={20} color={colors.mutedForeground} style={styles.inputIcon} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel={placeholder}
        {...inputProps}
      />
    </View>
  );
}

function PermissionRow({ icon, label, desc, granted, onRequest, styles, typography, t }) {
  return (
    <View style={styles.permissionRow}>
      <View style={[styles.permissionIconContainer, granted && styles.permissionIconGranted]}>
        <Ionicons name={icon} size={24} color={granted ? colors.success : colors.primary} />
      </View>
      <View style={styles.permissionText}>
        <Text style={styles.permissionLabel}>{label}</Text>
        <Text style={styles.permissionDesc}>{desc}</Text>
      </View>
      <TouchableOpacity
        style={[styles.permissionButton, granted && styles.permissionButtonGranted]}
        onPress={granted ? undefined : onRequest}
        disabled={granted}
        accessibilityLabel={granted ? t('onboarding.permissions.granted') : t('onboarding.permissions.allow')}
        accessibilityRole="button"
        accessibilityState={{ disabled: granted }}
      >
        {granted ? (
          <Ionicons name="checkmark" size={16} color={colors.success} />
        ) : (
          <Text style={styles.permissionButtonText}>{t('onboarding.permissions.allow')}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function CheckboxRow({ label, linkLabel, checked, onToggle, styles, typography }) {
  return (
    <TouchableOpacity
      style={styles.checkboxRow}
      onPress={onToggle}
      accessibilityLabel={label}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
      </View>
      <View style={styles.checkboxLabelContainer}>
        <Text style={styles.checkboxLabel}>{label} </Text>
        <Text style={styles.checkboxLink}>{linkLabel}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Data ────────────────────────────────────────────────────────────────────

const BENEFIT_ICONS = {
  earn:     'wallet-outline',
  flexible: 'time-outline',
  support:  'headset-outline',
  instant:  'flash-outline',
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const createStyles = (typography) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  progressBarOuter: {
    height: 3,
    backgroundColor: colors.border,
    width: '100%',
  },
  progressBarInner: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCounter: {
    ...typography.caption,
    color: colors.mutedForeground,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  stepContent: {
    paddingTop: 8,
  },
  illustrationContainer: {
    alignSelf: 'center',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: `${colors.primary}10`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  pendingIllustration: {
    backgroundColor: `${colors.warning}15`,
  },
  stepTitle: {
    ...typography.display,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 10,
    textAlign: 'center',
  },
  stepSubtitle: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginBottom: 28,
  },
  // Benefits list (Welcome step)
  benefitsList: {
    gap: 16,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  benefitIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: `${colors.primary}12`,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  benefitText: {
    flex: 1,
  },
  benefitTitle: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 2,
  },
  benefitDesc: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
  },
  // Vehicle step
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    marginBottom: 14,
    paddingHorizontal: 16,
    height: 56,
    ...shadows.sm,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.foreground,
  },
  // Phone step
  phoneVerifiedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.success}12`,
    borderRadius: radius.lg,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: `${colors.success}30`,
  },
  phoneVerifiedText: {
    color: colors.foreground,
    fontWeight: '600',
  },
  phoneVerifiedLabel: {
    color: colors.success,
    marginTop: 2,
  },
  otpHint: {
    color: colors.mutedForeground,
    marginBottom: 12,
    textAlign: 'center',
  },
  resendButton: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  resendText: {
    color: colors.primary,
    fontWeight: '600',
  },
  // Photos step
  sectionLabel: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 8,
  },
  sectionHint: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    marginBottom: 16,
  },
  // Permissions step
  permissionsList: {
    gap: 14,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    padding: 14,
    gap: 12,
    ...shadows.sm,
  },
  permissionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: `${colors.primary}12`,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  permissionIconGranted: {
    backgroundColor: `${colors.success}15`,
  },
  permissionText: {
    flex: 1,
  },
  permissionLabel: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 2,
  },
  permissionDesc: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
  },
  permissionButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    minWidth: 56,
    alignItems: 'center',
  },
  permissionButtonGranted: {
    backgroundColor: `${colors.success}20`,
  },
  permissionButtonText: {
    ...typography.captionSmall,
    color: '#fff',
    fontWeight: '700',
  },
  // Terms step
  termsCard: {
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 20,
    ...shadows.sm,
  },
  termsText: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    lineHeight: 22,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxLabelContainer: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  checkboxLabel: {
    ...typography.body,
    color: colors.foreground,
  },
  checkboxLink: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  // Pending step
  pendingStatusCard: {
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    padding: 18,
    gap: 14,
    ...shadows.sm,
    marginBottom: 18,
  },
  pendingStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pendingStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pendingStatusLabel: {
    ...typography.body,
    color: colors.foreground,
    flex: 1,
  },
  pendingNote: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  // Footer
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    height: 56,
    gap: 8,
    ...shadows.md,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    ...typography.button,
    color: colors.primaryForeground,
  },
});
