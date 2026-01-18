import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { transferAPI } from '../services/api';

const VEHICLE_TYPES = [
  { id: 'economy', label: 'Economy', icon: 'car-outline', price: 1 },
  { id: 'business', label: 'Business', icon: 'car-sport-outline', price: 1.5 },
  { id: 'firstClass', label: 'First Class', icon: 'car', price: 2 },
  { id: 'van', label: 'Van', icon: 'bus-outline', price: 1.3 },
  { id: 'minibus', label: 'Minibus', icon: 'bus', price: 1.8 },
];

export default function BookTransferScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Form state
  const [tripType, setTripType] = useState('oneWay');
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(new Date());
  const [returnDate, setReturnDate] = useState(new Date());
  const [returnTime, setReturnTime] = useState(new Date());
  const [passengers, setPassengers] = useState('1');
  const [luggage, setLuggage] = useState('0');
  const [vehicle, setVehicle] = useState('economy');
  const [flightNumber, setFlightNumber] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  // Date picker visibility
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showReturnDatePicker, setShowReturnDatePicker] = useState(false);
  const [showReturnTimePicker, setShowReturnTimePicker] = useState(false);

  const formatDate = (d) => {
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (t) => {
    return t.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const validateStep1 = () => {
    if (!pickupAddress.trim()) {
      Alert.alert('Error', 'Please enter pickup address');
      return false;
    }
    if (!dropoffAddress.trim()) {
      Alert.alert('Error', 'Please enter dropoff address');
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return false;
    }
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email');
      return false;
    }
    if (!phone.trim()) {
      Alert.alert('Error', 'Please enter your phone number');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateStep2()) return;

    setIsLoading(true);
    try {
      // Generate mock quote (in real app, you'd call a quote API first)
      const mockDistance = Math.floor(Math.random() * 50) + 10;
      const mockDuration = Math.floor(Math.random() * 60) + 15;
      const vehiclePrice = VEHICLE_TYPES.find(v => v.id === vehicle)?.price || 1;
      const basePrice = mockDistance * 2;
      const totalPrice = basePrice * vehiclePrice;

      const transferData = {
        tripType,
        pickup: {
          lat: 41.7151, // Mock coordinates (Tbilisi)
          lng: 44.8271,
          address: pickupAddress,
        },
        dropoff: {
          lat: 41.7251,
          lng: 44.8371,
          address: dropoffAddress,
        },
        pickupAddress,
        dropoffAddress,
        date: date.toISOString().split('T')[0],
        time: `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`,
        returnDate: tripType === 'roundTrip' ? returnDate.toISOString().split('T')[0] : null,
        returnTime: tripType === 'roundTrip' ? `${returnTime.getHours().toString().padStart(2, '0')}:${returnTime.getMinutes().toString().padStart(2, '0')}` : null,
        passengers: parseInt(passengers) || 1,
        luggage: parseInt(luggage) || 0,
        vehicle,
        flightNumber: flightNumber.trim() || undefined,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        notes: notes.trim() || undefined,
        quote: {
          distance: mockDistance,
          distanceText: `${mockDistance} km`,
          duration: mockDuration,
          durationText: `${mockDuration} min`,
          basePrice,
          totalPrice,
        },
      };

      const response = await transferAPI.create(transferData);

      if (response.data.success) {
        Alert.alert(
          'Booking Confirmed',
          'Your transfer has been booked successfully!',
          [
            {
              text: 'View My Transfers',
              onPress: () => navigation.navigate('MyTransfers'),
            },
          ]
        );
      }
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to book transfer');
    } finally {
      setIsLoading(false);
    }
  };

  const renderStep1 = () => (
    <>
      <View style={styles.tripTypeContainer}>
        <TouchableOpacity
          style={[styles.tripTypeButton, tripType === 'oneWay' && styles.tripTypeActive]}
          onPress={() => setTripType('oneWay')}
        >
          <Ionicons
            name="arrow-forward"
            size={20}
            color={tripType === 'oneWay' ? '#fff' : '#666'}
          />
          <Text style={[styles.tripTypeText, tripType === 'oneWay' && styles.tripTypeTextActive]}>
            One Way
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tripTypeButton, tripType === 'roundTrip' && styles.tripTypeActive]}
          onPress={() => setTripType('roundTrip')}
        >
          <Ionicons
            name="repeat"
            size={20}
            color={tripType === 'roundTrip' ? '#fff' : '#666'}
          />
          <Text style={[styles.tripTypeText, tripType === 'roundTrip' && styles.tripTypeTextActive]}>
            Round Trip
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Pickup Address</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="location" size={20} color="#16a34a" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Enter pickup location"
            placeholderTextColor="#999"
            value={pickupAddress}
            onChangeText={setPickupAddress}
          />
        </View>
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Dropoff Address</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="location" size={20} color="#dc2626" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Enter dropoff location"
            placeholderTextColor="#999"
            value={dropoffAddress}
            onChangeText={setDropoffAddress}
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={[styles.inputContainer, styles.halfWidth]}>
          <Text style={styles.label}>Date</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar-outline" size={20} color="#2563eb" />
            <Text style={styles.dateText}>{formatDate(date)}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.inputContainer, styles.halfWidth]}>
          <Text style={styles.label}>Time</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowTimePicker(true)}
          >
            <Ionicons name="time-outline" size={20} color="#2563eb" />
            <Text style={styles.dateText}>{formatTime(time)}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {tripType === 'roundTrip' && (
        <View style={styles.row}>
          <View style={[styles.inputContainer, styles.halfWidth]}>
            <Text style={styles.label}>Return Date</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowReturnDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={20} color="#2563eb" />
              <Text style={styles.dateText}>{formatDate(returnDate)}</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.inputContainer, styles.halfWidth]}>
            <Text style={styles.label}>Return Time</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowReturnTimePicker(true)}
            >
              <Ionicons name="time-outline" size={20} color="#2563eb" />
              <Text style={styles.dateText}>{formatTime(returnTime)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.row}>
        <View style={[styles.inputContainer, styles.halfWidth]}>
          <Text style={styles.label}>Passengers</Text>
          <View style={styles.counterContainer}>
            <TouchableOpacity
              style={styles.counterButton}
              onPress={() => setPassengers(Math.max(1, parseInt(passengers) - 1).toString())}
            >
              <Ionicons name="remove" size={20} color="#666" />
            </TouchableOpacity>
            <Text style={styles.counterValue}>{passengers}</Text>
            <TouchableOpacity
              style={styles.counterButton}
              onPress={() => setPassengers(Math.min(16, parseInt(passengers) + 1).toString())}
            >
              <Ionicons name="add" size={20} color="#666" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.inputContainer, styles.halfWidth]}>
          <Text style={styles.label}>Luggage</Text>
          <View style={styles.counterContainer}>
            <TouchableOpacity
              style={styles.counterButton}
              onPress={() => setLuggage(Math.max(0, parseInt(luggage) - 1).toString())}
            >
              <Ionicons name="remove" size={20} color="#666" />
            </TouchableOpacity>
            <Text style={styles.counterValue}>{luggage}</Text>
            <TouchableOpacity
              style={styles.counterButton}
              onPress={() => setLuggage(Math.min(20, parseInt(luggage) + 1).toString())}
            >
              <Ionicons name="add" size={20} color="#666" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Vehicle Type</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.vehicleScroll}>
          {VEHICLE_TYPES.map((v) => (
            <TouchableOpacity
              key={v.id}
              style={[styles.vehicleCard, vehicle === v.id && styles.vehicleCardActive]}
              onPress={() => setVehicle(v.id)}
            >
              <Ionicons
                name={v.icon}
                size={28}
                color={vehicle === v.id ? '#2563eb' : '#666'}
              />
              <Text style={[styles.vehicleText, vehicle === v.id && styles.vehicleTextActive]}>
                {v.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Flight Number (optional)</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="airplane-outline" size={20} color="#666" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="e.g., AA1234"
            placeholderTextColor="#999"
            value={flightNumber}
            onChangeText={setFlightNumber}
            autoCapitalize="characters"
          />
        </View>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          minimumDate={new Date()}
          onChange={(event, selectedDate) => {
            setShowDatePicker(Platform.OS === 'ios');
            if (selectedDate) setDate(selectedDate);
          }}
        />
      )}

      {showTimePicker && (
        <DateTimePicker
          value={time}
          mode="time"
          onChange={(event, selectedTime) => {
            setShowTimePicker(Platform.OS === 'ios');
            if (selectedTime) setTime(selectedTime);
          }}
        />
      )}

      {showReturnDatePicker && (
        <DateTimePicker
          value={returnDate}
          mode="date"
          minimumDate={date}
          onChange={(event, selectedDate) => {
            setShowReturnDatePicker(Platform.OS === 'ios');
            if (selectedDate) setReturnDate(selectedDate);
          }}
        />
      )}

      {showReturnTimePicker && (
        <DateTimePicker
          value={returnTime}
          mode="time"
          onChange={(event, selectedTime) => {
            setShowReturnTimePicker(Platform.OS === 'ios');
            if (selectedTime) setReturnTime(selectedTime);
          }}
        />
      )}
    </>
  );

  const renderStep2 = () => (
    <>
      <View style={styles.inputContainer}>
        <Text style={styles.label}>Full Name *</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="person-outline" size={20} color="#666" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Your full name"
            placeholderTextColor="#999"
            value={name}
            onChangeText={setName}
          />
        </View>
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Email *</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="mail-outline" size={20} color="#666" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="your@email.com"
            placeholderTextColor="#999"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Phone *</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="call-outline" size={20} color="#666" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="+1 234 567 8900"
            placeholderTextColor="#999"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </View>
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Additional Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Any special requests or notes..."
          placeholderTextColor="#999"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Booking Summary</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>From:</Text>
          <Text style={styles.summaryValue}>{pickupAddress}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>To:</Text>
          <Text style={styles.summaryValue}>{dropoffAddress}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Date:</Text>
          <Text style={styles.summaryValue}>{formatDate(date)} at {formatTime(time)}</Text>
        </View>
        {tripType === 'roundTrip' && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Return:</Text>
            <Text style={styles.summaryValue}>{formatDate(returnDate)} at {formatTime(returnTime)}</Text>
          </View>
        )}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Vehicle:</Text>
          <Text style={styles.summaryValue}>{VEHICLE_TYPES.find(v => v.id === vehicle)?.label}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Passengers:</Text>
          <Text style={styles.summaryValue}>{passengers}</Text>
        </View>
      </View>
    </>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: step === 1 ? '50%' : '100%' }]} />
        </View>
        <Text style={styles.progressText}>Step {step} of 2</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {step === 1 ? renderStep1() : renderStep2()}
        <View style={styles.bottomPadding} />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom }]}>
        {step === 2 && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setStep(1)}
          >
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.nextButton, step === 1 && { flex: 1 }]}
          onPress={() => {
            if (step === 1) {
              if (validateStep1()) setStep(2);
            } else {
              handleSubmit();
            }
          }}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.nextButtonText}>
              {step === 1 ? 'Continue' : 'Confirm Booking'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  progressContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    marginBottom: 8,
  },
  progressFill: {
    height: 4,
    backgroundColor: '#2563eb',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  tripTypeContainer: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  tripTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    marginHorizontal: 4,
  },
  tripTypeActive: {
    backgroundColor: '#2563eb',
  },
  tripTypeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginLeft: 8,
  },
  tripTypeTextActive: {
    color: '#fff',
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  inputIcon: {
    marginLeft: 16,
  },
  input: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: '#1a1a1a',
  },
  textArea: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    minHeight: 100,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    marginHorizontal: -6,
  },
  halfWidth: {
    flex: 1,
    marginHorizontal: 6,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dateText: {
    fontSize: 14,
    color: '#1a1a1a',
    marginLeft: 8,
  },
  counterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  counterButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  counterValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  vehicleScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  vehicleCard: {
    width: 80,
    alignItems: 'center',
    padding: 12,
    marginRight: 12,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  vehicleCardActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  vehicleText: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  vehicleTextActive: {
    color: '#2563eb',
  },
  summaryCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  summaryLabel: {
    width: 80,
    fontSize: 14,
    color: '#666',
  },
  summaryValue: {
    flex: 1,
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  backButton: {
    flex: 0.4,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    marginRight: 12,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  nextButton: {
    flex: 0.6,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  bottomPadding: {
    height: 24,
  },
});
