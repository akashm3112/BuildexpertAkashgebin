const express = require('express');
const router = express.Router();
const db = require('../database/connection');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// Test route to grant labour access directly
router.post('/grant-labour-access', auth, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7); // 7 days from now


    // Update user's labour access status
    const updateQuery = `
      UPDATE users 
      SET 
        labour_access_status = 'active',
        labour_access_start_date = $1,
        labour_access_end_date = $2
      WHERE id = $3
    `;

    await db.query(updateQuery, [startDate, endDate, userId]);

    // Create a test transaction record
    const transactionQuery = `
      INSERT INTO labour_payment_transactions (
        user_id, order_id, amount, status, service_name, payment_method, created_at, completed_at, transaction_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    const orderId = 'TEST_' + Date.now();
    const transactionId = 'TXN_' + Date.now();
    const now = new Date();

    await db.query(transactionQuery, [
      userId,
      orderId,
      99,
      'completed',
      'labors', // Service name for labour access
      'paytm', // Payment method
      now,
      now,
      transactionId
    ]);


    res.json({
      status: 'success',
      message: 'Labour access granted successfully',
      data: {
        userId,
        startDate,
        endDate,
        orderId,
        transactionId
      }
    });
}));

// Test route to check labour access status
router.get('/labour-access-status', auth, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const query = `
      SELECT 
        labour_access_status,
        labour_access_start_date,
        labour_access_end_date,
        CASE 
          WHEN labour_access_end_date < NOW() THEN true
          ELSE false
        END as is_expired,
        CASE 
          WHEN labour_access_status = 'active' AND labour_access_end_date >= NOW() THEN true
          ELSE false
        END as has_access,
        CASE 
          WHEN labour_access_end_date >= NOW() THEN 
            EXTRACT(DAY FROM (labour_access_end_date - NOW()))::INTEGER
          ELSE 0
        END as days_remaining
      FROM users 
      WHERE id = $1
    `;

    const result = await db.query(query, [userId]);
    const user = result.rows[0];

    if (!user) {
      return res.json({
        status: 'success',
        data: {
          accessStatus: 'inactive',
          startDate: null,
          endDate: null,
          isExpired: true,
          hasAccess: false,
          daysRemaining: 0
        }
      });
    }

    // Update status if expired
    if (user.is_expired && user.labour_access_status === 'active') {
      await db.query(
        'UPDATE users SET labour_access_status = $1 WHERE id = $2',
        ['expired', userId]
      );
      user.labour_access_status = 'expired';
      user.has_access = false;
    }

    res.json({
      status: 'success',
      data: {
        accessStatus: user.labour_access_status || 'inactive',
        startDate: user.labour_access_start_date,
        endDate: user.labour_access_end_date,
        isExpired: user.is_expired,
        hasAccess: user.has_access,
        daysRemaining: user.days_remaining
      }
    });
}));

module.exports = router;
