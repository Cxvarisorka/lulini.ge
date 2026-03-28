const express = require('express');
const { protect } = require('../middlewares/auth.middleware');
const { addFavorite, getFavorites, updateFavorite, deleteFavorite } = require('../controllers/favorites.controller');

const router = express.Router();

// All favorite routes require authentication
router.use(protect);

router.post('/', addFavorite);
router.get('/', getFavorites);
router.patch('/:id', updateFavorite);
router.delete('/:id', deleteFavorite);

module.exports = router;
