const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/gotours');

const Tour = require('../models/tour.model');

const sampleTours = [
  {
    name: "Tbilisi City Walking Tour",
    description: "Explore the charming old town of Tbilisi with a local guide. Visit historic sites, taste Georgian cuisine, and experience the unique blend of Eastern and Western culture. This comprehensive tour covers the most important landmarks including Narikala Fortress, sulfur baths, and the famous Bridge of Peace.",
    shortDescription: "Discover Tbilisi's old town, historic sites, and local culture",
    duration: "4 hours",
    category: "city",
    price: 35,
    priceType: "perPerson",
    maxGroupSize: 15,
    minGroupSize: 1,
    image: "https://images.unsplash.com/photo-1596394516093-501ba68a0ba6?w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1555993539-1732b0258235?w=800&q=80",
      "https://images.unsplash.com/photo-1574409811061-3e1e1c2cdcfd?w=800&q=80"
    ],
    includes: [
      "Professional English-speaking guide",
      "Walking tour of Old Tbilisi",
      "Visit to Narikala Fortress",
      "Traditional Georgian wine tasting",
      "Small snacks and water"
    ],
    excludes: [
      "Lunch and dinner",
      "Personal expenses",
      "Transportation to/from hotel",
      "Gratuities"
    ],
    itinerary: [
      {
        time: "10:00",
        title: "Meeting Point - Freedom Square",
        description: "Meet your guide at the famous Freedom Square in the heart of Tbilisi"
      },
      {
        time: "10:30",
        title: "Old Tbilisi District",
        description: "Walk through narrow streets, see traditional balconies and architecture"
      },
      {
        time: "11:30",
        title: "Narikala Fortress",
        description: "Visit the ancient fortress with panoramic views of the city"
      },
      {
        time: "12:30",
        title: "Sulfur Baths District",
        description: "Learn about the famous sulfur baths and their history"
      },
      {
        time: "13:30",
        title: "Wine Tasting & End",
        description: "Sample traditional Georgian wines and conclude the tour"
      }
    ],
    meetingPoint: "Freedom Square, Tbilisi (near the statue)",
    location: "Tbilisi",
    availableDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    languages: ["English", "Georgian", "Russian"],
    difficulty: "easy",
    requirements: "Comfortable walking shoes recommended. Moderate walking involved.",
    cancellationPolicy: "Free cancellation up to 24 hours before the tour",
    available: true,
    featured: true
  },
  {
    name: "Kazbegi Mountain Adventure",
    description: "Journey to the stunning Kazbegi region in the Greater Caucasus Mountains. Visit the iconic Gergeti Trinity Church perched at 2,170 meters, enjoy breathtaking mountain views, and experience authentic mountain village life. This full-day adventure includes scenic drives along the Georgian Military Highway and opportunities for photography.",
    shortDescription: "Mountain adventure with Gergeti Trinity Church and stunning Caucasus views",
    duration: "1 day",
    category: "mountain",
    price: 65,
    priceType: "perPerson",
    maxGroupSize: 12,
    minGroupSize: 2,
    image: "https://images.unsplash.com/photo-1601581987584-9f8f3b9f9b49?w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80",
      "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80"
    ],
    includes: [
      "Transportation from Tbilisi",
      "Professional driver and guide",
      "Stops at scenic viewpoints",
      "Visit to Ananuri Fortress",
      "4WD vehicle to Gergeti Church",
      "Bottled water"
    ],
    excludes: [
      "Meals (lunch available at local restaurants)",
      "Entrance fees",
      "Personal expenses"
    ],
    itinerary: [
      {
        time: "08:00",
        title: "Departure from Tbilisi",
        description: "Pick up from your hotel and drive along the Georgian Military Highway"
      },
      {
        time: "10:00",
        title: "Ananuri Fortress Complex",
        description: "Stop at the medieval fortress on Aragvi River"
      },
      {
        time: "12:00",
        title: "Arrival in Kazbegi",
        description: "Reach Stepantsminda village at the foot of Mount Kazbek"
      },
      {
        time: "12:30",
        title: "Gergeti Trinity Church",
        description: "4WD ride to the iconic hilltop church with mountain views"
      },
      {
        time: "14:30",
        title: "Lunch Break",
        description: "Traditional Georgian lunch in a local restaurant (optional)"
      },
      {
        time: "16:00",
        title: "Return Journey",
        description: "Scenic drive back to Tbilisi with photo stops"
      },
      {
        time: "19:00",
        title: "Arrival in Tbilisi",
        description: "Drop off at your hotel"
      }
    ],
    meetingPoint: "Hotel pickup in Tbilisi (within city center)",
    location: "Kazbegi / Stepantsminda",
    availableDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    languages: ["English", "Georgian", "Russian"],
    difficulty: "moderate",
    requirements: "Warm clothing recommended. Some walking at high altitude. Not suitable for those with severe mobility issues.",
    cancellationPolicy: "Free cancellation up to 48 hours before the tour",
    available: true,
    featured: true
  },
  {
    name: "Kakheti Wine Region Tour",
    description: "Discover Georgia's premier wine region with visits to traditional wineries and wine cellars. Learn about the ancient Georgian winemaking tradition (8,000 years old), visit family-owned wineries, and taste various Georgian wines. Includes visits to Sighnaghi 'City of Love' and the Bodbe Monastery.",
    shortDescription: "Wine tasting tour in Kakheti with visits to traditional wineries",
    duration: "1 day",
    category: "wine",
    price: 55,
    priceType: "perPerson",
    maxGroupSize: 15,
    minGroupSize: 2,
    image: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=800&q=80",
      "https://images.unsplash.com/photo-1474722883778-792e7990302f?w=800&q=80"
    ],
    includes: [
      "Transportation from Tbilisi",
      "English-speaking guide",
      "Wine tastings at 2-3 wineries",
      "Visit to Sighnaghi town",
      "Bodbe Monastery visit",
      "Traditional lunch at a winery",
      "All wine tasting fees"
    ],
    excludes: [
      "Additional wine purchases",
      "Personal expenses",
      "Gratuities"
    ],
    itinerary: [
      {
        time: "09:00",
        title: "Departure from Tbilisi",
        description: "Drive to Kakheti wine region"
      },
      {
        time: "10:30",
        title: "First Winery Visit",
        description: "Tour a traditional winery and taste wines made in qvevri (clay vessels)"
      },
      {
        time: "12:00",
        title: "Bodbe Monastery",
        description: "Visit the beautiful monastery and its gardens"
      },
      {
        time: "13:00",
        title: "Sighnaghi Town",
        description: "Explore the charming hilltop town with panoramic views"
      },
      {
        time: "14:00",
        title: "Traditional Lunch",
        description: "Enjoy authentic Georgian cuisine at a local winery"
      },
      {
        time: "15:30",
        title: "Second Winery Visit",
        description: "More wine tasting and cellar tour"
      },
      {
        time: "17:00",
        title: "Return to Tbilisi",
        description: "Scenic drive back to the capital"
      }
    ],
    meetingPoint: "Hotel pickup in Tbilisi",
    location: "Kakheti Region",
    availableDays: ["tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    languages: ["English", "Georgian", "Russian"],
    difficulty: "easy",
    requirements: "Participants must be 18+ years old for wine tasting. Comfortable shoes recommended.",
    cancellationPolicy: "Free cancellation up to 24 hours before the tour",
    available: true,
    featured: false
  },
  {
    name: "Mtskheta & Jvari Monastery Half-Day Tour",
    description: "Visit Georgia's ancient capital Mtskheta, a UNESCO World Heritage site. Explore the historic Jvari Monastery with stunning views of river confluence, and the magnificent Svetitskhoveli Cathedral. Learn about Georgia's conversion to Christianity and its rich religious history.",
    shortDescription: "UNESCO heritage sites tour to Mtskheta and ancient monasteries",
    duration: "5 hours",
    category: "historical",
    price: 30,
    priceType: "perPerson",
    maxGroupSize: 15,
    minGroupSize: 1,
    image: "https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1609137144813-7d9921338f24?w=800&q=80"
    ],
    includes: [
      "Transportation from Tbilisi",
      "English-speaking guide",
      "Entrance to Svetitskhoveli Cathedral",
      "Visit to Jvari Monastery",
      "Bottled water"
    ],
    excludes: [
      "Meals",
      "Personal expenses",
      "Photo fees at religious sites"
    ],
    itinerary: [
      {
        time: "10:00",
        title: "Departure from Tbilisi",
        description: "Short drive to Mtskheta (25 km)"
      },
      {
        time: "10:30",
        title: "Jvari Monastery",
        description: "6th-century monastery with panoramic views"
      },
      {
        time: "11:30",
        title: "Svetitskhoveli Cathedral",
        description: "Main cathedral of Georgia and burial site of Christ's mantle"
      },
      {
        time: "13:00",
        title: "Old Town Mtskheta",
        description: "Free time to explore shops and cafes"
      },
      {
        time: "14:30",
        title: "Return to Tbilisi",
        description: "Drive back to the capital"
      }
    ],
    meetingPoint: "Freedom Square, Tbilisi or hotel pickup",
    location: "Mtskheta",
    availableDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    languages: ["English", "Georgian", "Russian", "Spanish"],
    difficulty: "easy",
    requirements: "Modest dress required for religious sites (covered shoulders and knees)",
    cancellationPolicy: "Free cancellation up to 24 hours before the tour",
    available: true,
    featured: false
  },
  {
    name: "Vardzia Cave Monastery Adventure",
    description: "Explore the incredible Vardzia cave monastery complex carved into a cliff face in the 12th century. This full-day adventure takes you through southern Georgia's dramatic landscapes, including stops at the Borjomi resort town and the Rabati Fortress. A journey through history and stunning scenery.",
    shortDescription: "Visit the spectacular 12th-century cave monastery complex of Vardzia",
    duration: "1 day",
    category: "historical",
    price: 75,
    priceType: "perPerson",
    maxGroupSize: 12,
    minGroupSize: 3,
    image: "https://images.unsplash.com/photo-1609137008074-977d78b11a6c?w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1601581987584-9f8f3b9f9b49?w=800&q=80"
    ],
    includes: [
      "Transportation from Tbilisi",
      "Professional guide",
      "Entrance to Vardzia",
      "Stop at Borjomi",
      "Visit to Rabati Fortress",
      "Bottled water"
    ],
    excludes: [
      "Meals (stops at restaurants available)",
      "Personal expenses",
      "Optional activities"
    ],
    itinerary: [
      {
        time: "07:00",
        title: "Early Departure",
        description: "Leave Tbilisi for southern Georgia"
      },
      {
        time: "10:00",
        title: "Borjomi Stop",
        description: "Visit the famous mineral water park town"
      },
      {
        time: "12:00",
        title: "Rabati Fortress",
        description: "Explore the medieval fortress complex in Akhaltsikhe"
      },
      {
        time: "13:30",
        title: "Lunch Break",
        description: "Traditional lunch in local restaurant"
      },
      {
        time: "15:00",
        title: "Vardzia Cave Monastery",
        description: "Extensive tour of the cave complex with 6,000 rooms"
      },
      {
        time: "17:30",
        title: "Return Journey",
        description: "Drive back to Tbilisi"
      },
      {
        time: "21:00",
        title: "Arrival",
        description: "Drop off at hotels in Tbilisi"
      }
    ],
    meetingPoint: "Hotel pickup in Tbilisi",
    location: "Vardzia / Southern Georgia",
    availableDays: ["wednesday", "friday", "saturday", "sunday"],
    languages: ["English", "Georgian"],
    difficulty: "moderate",
    requirements: "Long day with significant walking. Good fitness level recommended. Not suitable for children under 8.",
    cancellationPolicy: "Free cancellation up to 48 hours before the tour. 50% refund within 24 hours.",
    available: true,
    featured: true
  },
  {
    name: "Georgian Cooking Class Experience",
    description: "Learn to cook authentic Georgian dishes in a local family's home. Master the art of making khinkali (dumplings), khachapuri (cheese bread), and other traditional dishes. Includes a market visit, hands-on cooking, and enjoying your meal with the host family.",
    shortDescription: "Hands-on Georgian cooking class with local family and market visit",
    duration: "4 hours",
    category: "food",
    price: 45,
    priceType: "perPerson",
    maxGroupSize: 8,
    minGroupSize: 2,
    image: "https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80"
    ],
    includes: [
      "Market tour with your host",
      "All ingredients and supplies",
      "Hands-on cooking instruction",
      "Full meal including wine",
      "Recipe booklet to take home",
      "English-speaking host"
    ],
    excludes: [
      "Transportation to/from meeting point",
      "Additional beverages",
      "Gratuities"
    ],
    itinerary: [
      {
        time: "11:00",
        title: "Meet at Local Market",
        description: "Tour the market and select fresh ingredients"
      },
      {
        time: "12:00",
        title: "Arrive at Family Home",
        description: "Welcome drinks and introduction to Georgian cuisine"
      },
      {
        time: "12:30",
        title: "Cooking Session",
        description: "Learn to make khinkali, khachapuri, and salads"
      },
      {
        time: "14:30",
        title: "Feast Together",
        description: "Enjoy the dishes you prepared with Georgian wine"
      }
    ],
    meetingPoint: "Dezerter Bazaar, Tbilisi",
    location: "Tbilisi",
    availableDays: ["tuesday", "thursday", "friday", "saturday", "sunday"],
    languages: ["English", "Georgian"],
    difficulty: "easy",
    requirements: "Please inform of any dietary restrictions in advance",
    cancellationPolicy: "Free cancellation up to 48 hours before the class",
    available: true,
    featured: false
  }
];

async function seedTours() {
  try {
    // Clear existing tours
    await Tour.deleteMany({});
    console.log('Cleared existing tours');

    // Insert sample tours
    const tours = await Tour.insertMany(sampleTours);
    console.log(`Successfully created ${tours.length} tours:`);
    tours.forEach(tour => {
      console.log(`- ${tour.name} (${tour.category}) - $${tour.price}`);
    });

    console.log('\nTours seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding tours:', error);
    process.exit(1);
  }
}

// Run the seeding
seedTours();
