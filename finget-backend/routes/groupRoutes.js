const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const { createGroup, joinGroup, getGroups } = require('../controllers/groupController');

router.post('/', auth, createGroup);
router.post('/:id/join', auth, joinGroup);
router.get('/', auth, getGroups);

module.exports = router;
