const express = require('express');
const router = express.Router();

const {
    createTransfer,
    getMyTransfers,
    getTransfer,
    cancelTransfer,
    getAllTransfers,
    updateTransferStatus,
    deleteTransfer
} = require('../controllers/transfer.controller');

const { protect, authorize } = require('../middlewares/auth.middleware');

// All routes require authentication
router.use(protect);

// User routes
router.post('/', createTransfer);
router.get('/my', getMyTransfers);
router.get('/:id', getTransfer);
router.patch('/:id/cancel', cancelTransfer);

// Admin only routes
router.get('/', authorize('admin'), getAllTransfers);
router.patch('/:id/status', authorize('admin'), updateTransferStatus);
router.delete('/:id', authorize('admin'), deleteTransfer);

module.exports = router;
