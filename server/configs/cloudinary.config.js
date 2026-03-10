const cloudinary = require('cloudinary');
const multer = require('multer');
const createCloudinaryStorage = require('multer-storage-cloudinary');

cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const driverPhotoStorage = createCloudinaryStorage({
    cloudinary,
    folder: 'lulini/drivers',
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
});

const uploadDriverPhoto = multer({
    storage: driverPhotoStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

module.exports = { cloudinary: cloudinary.v2, uploadDriverPhoto };
