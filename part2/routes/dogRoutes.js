const express = require('express');
const router = express.Router();
// GET /api/dogs
const db = require('../models/db');
router.get('/dogs', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT * FROM Dogs
        `);
        return res.json(rows);
    } catch (err) {
        return res.status(500).json({error: err.message});
    }
});
module.exports = router;