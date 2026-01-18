const Transfer = require('../models/transfer.model');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// @desc    Create new transfer booking
// @route   POST /api/transfers
// @access  Private (logged in users only)
const createTransfer = catchAsync(async (req, res, next) => {
    const transferData = {
        ...req.body,
        user: req.user.id // Connect transfer to logged in user's ID
    };

    const transfer = await Transfer.create(transferData);

    // Populate user data for the response
    const populatedTransfer = await Transfer.findById(transfer._id).populate('user', 'firstName lastName email');

    // Emit real-time event to admin room
    const io = req.app.get('io');
    if (io) {
        io.to('admin').emit('transfer:created', populatedTransfer);
    }

    res.status(201).json({
        success: true,
        message: 'Transfer booking created successfully',
        data: { transfer: populatedTransfer }
    });
});

// @desc    Get all transfers for logged in user
// @route   GET /api/transfers/my
// @access  Private
const getMyTransfers = catchAsync(async (req, res, next) => {
    const transfers = await Transfer.find({ user: req.user.id })
        .sort({ createdAt: -1 });

    res.json({
        success: true,
        count: transfers.length,
        data: { transfers }
    });
});

// @desc    Get single transfer by ID
// @route   GET /api/transfers/:id
// @access  Private (owner or admin)
const getTransfer = catchAsync(async (req, res, next) => {
    const transfer = await Transfer.findById(req.params.id).populate('user', 'firstName lastName email');

    if (!transfer) {
        return next(new AppError('Transfer not found', 404));
    }

    // Check if user owns this transfer or is admin
    if (transfer.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
        return next(new AppError('Not authorized to access this transfer', 403));
    }

    res.json({
        success: true,
        data: { transfer }
    });
});

// @desc    Update transfer status (cancel by user)
// @route   PATCH /api/transfers/:id/cancel
// @access  Private (owner only)
const cancelTransfer = catchAsync(async (req, res, next) => {
    const transfer = await Transfer.findById(req.params.id);

    if (!transfer) {
        return next(new AppError('Transfer not found', 404));
    }

    // Check if user owns this transfer
    if (transfer.user.toString() !== req.user.id) {
        return next(new AppError('Not authorized to cancel this transfer', 403));
    }

    // Can only cancel pending or confirmed transfers
    if (!['pending', 'confirmed'].includes(transfer.status)) {
        return next(new AppError('Cannot cancel a transfer that is already completed or cancelled', 400));
    }

    transfer.status = 'cancelled';
    await transfer.save();

    // Populate and emit to admin
    const populatedTransfer = await Transfer.findById(transfer._id).populate('user', 'firstName lastName email');
    const io = req.app.get('io');
    if (io) {
        io.to('admin').emit('transfer:updated', populatedTransfer);
    }

    res.json({
        success: true,
        message: 'Transfer cancelled successfully',
        data: { transfer: populatedTransfer }
    });
});

// ============ ADMIN ROUTES ============

// @desc    Get all transfers (admin)
// @route   GET /api/transfers
// @access  Private/Admin
const getAllTransfers = catchAsync(async (req, res, next) => {
    const { status } = req.query;

    const query = {};
    if (status && status !== 'all') {
        query.status = status;
    }

    const transfers = await Transfer.find(query)
        .populate('user', 'firstName lastName email')
        .sort({ createdAt: -1 });

    res.json({
        success: true,
        count: transfers.length,
        data: { transfers }
    });
});

// @desc    Update transfer status (admin)
// @route   PATCH /api/transfers/:id/status
// @access  Private/Admin
const updateTransferStatus = catchAsync(async (req, res, next) => {
    const { status } = req.body;

    if (!['pending', 'confirmed', 'completed', 'cancelled'].includes(status)) {
        return next(new AppError('Invalid status value', 400));
    }

    const transfer = await Transfer.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true, runValidators: true }
    ).populate('user', 'firstName lastName email');

    if (!transfer) {
        return next(new AppError('Transfer not found', 404));
    }

    // Emit real-time event to admin room and user
    const io = req.app.get('io');
    if (io) {
        io.to('admin').emit('transfer:updated', transfer);
        // Also notify the user who owns this transfer
        if (transfer.user && transfer.user._id) {
            io.to(`user:${transfer.user._id}`).emit('transfer:updated', transfer);
        }
    }

    res.json({
        success: true,
        message: 'Transfer status updated successfully',
        data: { transfer }
    });
});

// @desc    Delete transfer (admin)
// @route   DELETE /api/transfers/:id
// @access  Private/Admin
const deleteTransfer = catchAsync(async (req, res, next) => {
    const transfer = await Transfer.findById(req.params.id);

    if (!transfer) {
        return next(new AppError('Transfer not found', 404));
    }

    const transferId = transfer._id;
    const userId = transfer.user;

    await Transfer.findByIdAndDelete(req.params.id);

    // Emit real-time event to admin room and user
    const io = req.app.get('io');
    if (io) {
        io.to('admin').emit('transfer:deleted', { _id: transferId });
        // Also notify the user who owned this transfer
        if (userId) {
            io.to(`user:${userId}`).emit('transfer:deleted', { _id: transferId });
        }
    }

    res.json({
        success: true,
        message: 'Transfer deleted successfully',
        data: null
    });
});

module.exports = {
    createTransfer,
    getMyTransfers,
    getTransfer,
    cancelTransfer,
    getAllTransfers,
    updateTransferStatus,
    deleteTransfer
};
