// City locations where cars are parked
export const cityLocations = [
  {
    id: 'tbilisi',
    name: 'Tbilisi',
    address: 'Rustaveli Avenue 12, Tbilisi',
    coordinates: { lat: 41.7151, lng: 44.8271 },
    carsAvailable: 8
  },
  {
    id: 'batumi',
    name: 'Batumi',
    address: 'Batumi Boulevard 5, Batumi',
    coordinates: { lat: 41.6168, lng: 41.6367 },
    carsAvailable: 5
  },
  {
    id: 'kutaisi',
    name: 'Kutaisi',
    address: 'Tsereteli Street 23, Kutaisi',
    coordinates: { lat: 42.2679, lng: 42.6946 },
    carsAvailable: 4
  },
  {
    id: 'tbilisi-airport',
    name: 'Tbilisi Airport',
    address: 'Tbilisi International Airport',
    coordinates: { lat: 41.6692, lng: 44.9547 },
    carsAvailable: 6
  },
  {
    id: 'batumi-airport',
    name: 'Batumi Airport',
    address: 'Batumi International Airport',
    coordinates: { lat: 41.6103, lng: 41.5997 },
    carsAvailable: 3
  }
];

export const rentalCars = [
  {
    id: 'toyota-corolla',
    brand: 'Toyota',
    model: 'Corolla',
    year: 2024,
    category: 'economy',
    locationId: 'tbilisi',
    image: 'https://images.unsplash.com/photo-1623869675781-80aa31012a5a?w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1623869675781-80aa31012a5a?w=800&q=80',
      'https://images.unsplash.com/photo-1621993202323-f438eec934ff?w=800&q=80',
      'https://images.unsplash.com/photo-1619682817481-e994891cd1f5?w=800&q=80'
    ],
    pricePerDay: 45,
    passengers: 5,
    luggage: 3,
    doors: 4,
    transmission: 'automatic',
    fuelType: 'petrol',
    airConditioning: true,
    features: ['Bluetooth', 'USB Charging', 'Backup Camera', 'Cruise Control'],
    description: 'The Toyota Corolla is a reliable and fuel-efficient sedan, perfect for city driving and short trips.',
    mileageLimit: 'unlimited',
    deposit: 200,
    minAge: 21,
    available: true
  },
  {
    id: 'honda-civic',
    brand: 'Honda',
    model: 'Civic',
    year: 2024,
    category: 'economy',
    locationId: 'batumi',
    image: 'https://images.unsplash.com/photo-1606611013016-969c19ba27bb?w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1606611013016-969c19ba27bb?w=800&q=80',
      'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&q=80'
    ],
    pricePerDay: 50,
    passengers: 5,
    luggage: 3,
    doors: 4,
    transmission: 'automatic',
    fuelType: 'petrol',
    airConditioning: true,
    features: ['Apple CarPlay', 'Android Auto', 'Lane Assist', 'Sunroof'],
    description: 'The Honda Civic offers a sporty design with excellent fuel economy and modern tech features.',
    mileageLimit: 'unlimited',
    deposit: 200,
    minAge: 21,
    available: true
  },
  {
    id: 'bmw-3-series',
    brand: 'BMW',
    model: '3 Series',
    year: 2024,
    category: 'business',
    locationId: 'tbilisi-airport',
    image: 'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80',
      'https://images.unsplash.com/photo-1523983388277-336a66bf9bcd?w=800&q=80',
      'https://images.unsplash.com/photo-1556189250-72ba954cfc2b?w=800&q=80'
    ],
    pricePerDay: 95,
    passengers: 5,
    luggage: 3,
    doors: 4,
    transmission: 'automatic',
    fuelType: 'petrol',
    airConditioning: true,
    features: ['Leather Seats', 'Navigation', 'Premium Sound', 'Parking Sensors', 'Heated Seats'],
    description: 'The BMW 3 Series combines luxury with performance, ideal for business travelers seeking comfort and style.',
    mileageLimit: 'unlimited',
    deposit: 500,
    minAge: 25,
    available: true
  },
  {
    id: 'mercedes-e-class',
    brand: 'Mercedes-Benz',
    model: 'E-Class',
    year: 2024,
    category: 'luxury',
    locationId: 'tbilisi',
    image: 'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&q=80',
      'https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=800&q=80',
      'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800&q=80'
    ],
    pricePerDay: 150,
    passengers: 5,
    luggage: 4,
    doors: 4,
    transmission: 'automatic',
    fuelType: 'petrol',
    airConditioning: true,
    features: ['Premium Leather', 'Massage Seats', 'Burmester Sound', '360° Camera', 'Ambient Lighting'],
    description: 'The Mercedes-Benz E-Class offers unparalleled luxury and cutting-edge technology for the discerning driver.',
    mileageLimit: 'unlimited',
    deposit: 800,
    minAge: 25,
    available: true
  },
  {
    id: 'audi-a6',
    brand: 'Audi',
    model: 'A6',
    year: 2024,
    category: 'luxury',
    locationId: 'tbilisi-airport',
    image: 'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800&q=80',
      'https://images.unsplash.com/photo-1603584173870-7f23fdae1b7a?w=800&q=80'
    ],
    pricePerDay: 140,
    passengers: 5,
    luggage: 4,
    doors: 4,
    transmission: 'automatic',
    fuelType: 'diesel',
    airConditioning: true,
    features: ['Virtual Cockpit', 'Matrix LED', 'Bang & Olufsen', 'Adaptive Cruise', 'Night Vision'],
    description: 'The Audi A6 delivers sophisticated design and advanced technology for a premium driving experience.',
    mileageLimit: 'unlimited',
    deposit: 700,
    minAge: 25,
    available: true
  },
  {
    id: 'volkswagen-golf',
    brand: 'Volkswagen',
    model: 'Golf',
    year: 2024,
    category: 'economy',
    locationId: 'kutaisi',
    image: 'https://images.unsplash.com/photo-1632245889029-e406faaa34cd?w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1632245889029-e406faaa34cd?w=800&q=80',
      'https://images.unsplash.com/photo-1631295868223-63265b40d9e4?w=800&q=80'
    ],
    pricePerDay: 55,
    passengers: 5,
    luggage: 3,
    doors: 4,
    transmission: 'automatic',
    fuelType: 'petrol',
    airConditioning: true,
    features: ['Digital Cockpit', 'Wireless CarPlay', 'Adaptive Cruise', 'Park Assist'],
    description: 'The Volkswagen Golf is a versatile hatchback with German engineering and modern features.',
    mileageLimit: 'unlimited',
    deposit: 250,
    minAge: 21,
    available: true
  },
  {
    id: 'toyota-rav4',
    brand: 'Toyota',
    model: 'RAV4',
    year: 2024,
    category: 'suv',
    locationId: 'tbilisi',
    image: 'https://images.unsplash.com/photo-1581540222194-0def2dda95b8?w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1581540222194-0def2dda95b8?w=800&q=80',
      'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&q=80'
    ],
    pricePerDay: 75,
    passengers: 5,
    luggage: 5,
    doors: 5,
    transmission: 'automatic',
    fuelType: 'hybrid',
    airConditioning: true,
    features: ['All-Wheel Drive', 'Toyota Safety Sense', 'Power Liftgate', 'Panoramic Roof'],
    description: 'The Toyota RAV4 Hybrid offers excellent fuel economy with SUV versatility for adventures.',
    mileageLimit: 'unlimited',
    deposit: 350,
    minAge: 23,
    available: true
  },
  {
    id: 'range-rover-sport',
    brand: 'Land Rover',
    model: 'Range Rover Sport',
    year: 2024,
    category: 'suv',
    locationId: 'batumi-airport',
    image: 'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800&q=80',
      'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=800&q=80'
    ],
    pricePerDay: 200,
    passengers: 5,
    luggage: 5,
    doors: 5,
    transmission: 'automatic',
    fuelType: 'diesel',
    airConditioning: true,
    features: ['Terrain Response', 'Meridian Sound', 'Panoramic Roof', 'Head-Up Display', 'Air Suspension'],
    description: 'The Range Rover Sport combines luxury with off-road capability for the ultimate SUV experience.',
    mileageLimit: 'unlimited',
    deposit: 1000,
    minAge: 25,
    available: true
  },
  {
    id: 'ford-mustang',
    brand: 'Ford',
    model: 'Mustang',
    year: 2024,
    category: 'sports',
    locationId: 'tbilisi',
    image: 'https://images.unsplash.com/photo-1584345604476-8ec5f82d661f?w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1584345604476-8ec5f82d661f?w=800&q=80',
      'https://images.unsplash.com/photo-1547744152-14d985cb937f?w=800&q=80'
    ],
    pricePerDay: 120,
    passengers: 4,
    luggage: 2,
    doors: 2,
    transmission: 'automatic',
    fuelType: 'petrol',
    airConditioning: true,
    features: ['V8 Engine', 'Sport Mode', 'Track Apps', 'Premium Sound', 'Launch Control'],
    description: 'The Ford Mustang delivers iconic American muscle with modern performance technology.',
    mileageLimit: '200km/day',
    deposit: 600,
    minAge: 25,
    available: true
  },
  {
    id: 'porsche-911',
    brand: 'Porsche',
    model: '911 Carrera',
    year: 2024,
    category: 'sports',
    locationId: 'batumi',
    image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80',
      'https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?w=800&q=80'
    ],
    pricePerDay: 350,
    passengers: 2,
    luggage: 1,
    doors: 2,
    transmission: 'automatic',
    fuelType: 'petrol',
    airConditioning: true,
    features: ['Sport Chrono', 'PASM', 'Bose Sound', 'Sport Exhaust', 'Carbon Interior'],
    description: 'The Porsche 911 Carrera is the ultimate sports car, delivering legendary performance and handling.',
    mileageLimit: '150km/day',
    deposit: 2000,
    minAge: 25,
    available: true
  }
];

export const categories = [
  { id: 'all', label: 'All Cars' },
  { id: 'economy', label: 'Economy' },
  { id: 'business', label: 'Business' },
  { id: 'luxury', label: 'Luxury' },
  { id: 'suv', label: 'SUV' },
  { id: 'sports', label: 'Sports' }
];

export function getCarById(id) {
  return rentalCars.find(car => car.id === id);
}

export function getCarsByCategory(category) {
  if (category === 'all') return rentalCars;
  return rentalCars.filter(car => car.category === category);
}

export function getLocationById(id) {
  return cityLocations.find(location => location.id === id);
}

export function getCarsByLocation(locationId) {
  if (!locationId || locationId === 'all') return rentalCars;
  return rentalCars.filter(car => car.locationId === locationId);
}

export function searchCars(query, cars = rentalCars) {
  if (!query || query.trim() === '') return cars;
  const searchTerm = query.toLowerCase().trim();
  return cars.filter(car =>
    car.brand.toLowerCase().includes(searchTerm) ||
    car.model.toLowerCase().includes(searchTerm) ||
    `${car.brand} ${car.model}`.toLowerCase().includes(searchTerm) ||
    car.category.toLowerCase().includes(searchTerm) ||
    car.features.some(f => f.toLowerCase().includes(searchTerm))
  );
}
