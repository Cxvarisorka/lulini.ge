const cloudinary = require('cloudinary');
const multer = require('multer');
const createCloudinaryStorage = require('multer-storage-cloudinary');

// Validate Cloudinary configuration at module load time so misconfiguration
// is caught at server startup rather than at the first upload request.
const CLOUDINARY_REQUIRED_VARS = [
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET'
];
const missingCloudinaryVars = CLOUDINARY_REQUIRED_VARS.filter(v => !process.env[v]);
if (missingCloudinaryVars.length > 0) {
    console.warn(
        `[cloudinary] WARNING: Missing environment variable(s): ${missingCloudinaryVars.join(', ')}. ` +
        'File uploads will fail until these are configured.'
    );
}

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

// Driver document storage — PDFs and images accepted, stored in a documents subfolder
const driverDocumentStorage = createCloudinaryStorage({
    cloudinary,
    folder: 'lulini/driver-documents',
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
    // No image transformation — preserve original for admin review
});

const uploadDriverDocument = multer({
    storage: driverDocumentStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB — PDFs can be larger than photos
});

module.exports = { cloudinary: cloudinary.v2, uploadDriverPhoto, uploadDriverDocument };
