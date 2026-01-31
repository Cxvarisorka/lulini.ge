require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Driver = require('../models/driver.model');

const createTestDriver = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Check if test driver already exists
        const existingUser = await User.findOne({ email: 'driver@test.com' });
        if (existingUser) {
            console.log('Test driver already exists with email: driver@test.com');

            // Check if driver profile exists
            const existingDriver = await Driver.findOne({ user: existingUser._id });
            if (existingDriver) {
                console.log('Driver profile exists:', {
                    email: existingUser.email,
                    name: `${existingUser.firstName} ${existingUser.lastName}`,
                    isActive: existingDriver.isActive,
                    isApproved: existingDriver.isApproved,
                    vehicleType: existingDriver.vehicle.type
                });
            } else {
                console.log('User exists but has no driver profile. Creating driver profile...');
                const driver = await Driver.create({
                    user: existingUser._id,
                    phone: '+995555000001',
                    licenseNumber: 'TEST-DRV-001',
                    vehicle: {
                        type: 'economy',
                        make: 'Toyota',
                        model: 'Prius',
                        year: 2020,
                        licensePlate: 'TB-123-TB',
                        color: 'White'
                    },
                    isActive: true,
                    isApproved: true
                });
                console.log('Driver profile created successfully!');
            }

            process.exit(0);
            return;
        }

        // Create test driver user
        const user = await User.create({
            email: 'driver@test.com',
            password: 'password123',
            firstName: 'Test',
            lastName: 'Driver',
            phone: '+995555000001',
            role: 'driver',
            provider: 'local',
            isVerified: true
        });

        console.log('Test driver user created:', user.email);

        // Create driver profile
        const driver = await Driver.create({
            user: user._id,
            phone: '+995555000001',
            licenseNumber: 'TEST-DRV-001',
            vehicle: {
                type: 'economy',
                make: 'Toyota',
                model: 'Prius',
                year: 2020,
                licensePlate: 'TB-123-TB',
                color: 'White'
            },
            isActive: true,
            isApproved: true
        });

        console.log('Test driver profile created successfully!');
        console.log('\n=== Test Driver Credentials ===');
        console.log('Email: driver@test.com');
        console.log('Password: password123');
        console.log('Vehicle Type: economy');
        console.log('Status: Active & Approved');
        console.log('================================\n');

        process.exit(0);
    } catch (error) {
        console.error('Error creating test driver:', error);
        process.exit(1);
    }
};

createTestDriver();
