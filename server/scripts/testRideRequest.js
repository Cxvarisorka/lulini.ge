require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Driver = require('../models/driver.model');

const testDriverStatus = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Find all drivers
        const allDrivers = await Driver.find().populate('user', 'email firstName lastName');
        console.log('\n=== ALL DRIVERS ===');
        allDrivers.forEach(driver => {
            console.log({
                email: driver.user?.email,
                name: `${driver.user?.firstName} ${driver.user?.lastName}`,
                status: driver.status,
                vehicleType: driver.vehicle.type,
                isActive: driver.isActive,
                isApproved: driver.isApproved,
                userId: driver.user?._id.toString()
            });
        });

        // Find online drivers
        const onlineDrivers = await Driver.find({
            status: 'online',
            isActive: true,
            isApproved: true
        }).populate('user', 'email firstName lastName _id');

        console.log('\n=== ONLINE DRIVERS ===');
        console.log(`Found ${onlineDrivers.length} online drivers`);
        onlineDrivers.forEach(driver => {
            console.log({
                email: driver.user?.email,
                vehicleType: driver.vehicle.type,
                userId: driver.user?._id.toString(),
                roomName: `driver:${driver.user?._id}`
            });
        });

        // Find economy drivers
        const economyDrivers = await Driver.find({
            status: 'online',
            isActive: true,
            isApproved: true,
            'vehicle.type': 'economy'
        }).populate('user', 'email firstName lastName');

        console.log('\n=== ONLINE ECONOMY DRIVERS ===');
        console.log(`Found ${economyDrivers.length} economy drivers`);
        economyDrivers.forEach(driver => {
            console.log({
                email: driver.user?.email,
                vehicleType: driver.vehicle.type,
                roomName: `driver:${driver.user?._id}`
            });
        });

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

testDriverStatus();
