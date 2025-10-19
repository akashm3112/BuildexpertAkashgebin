const express = require('express');
const { getRows, query } = require('../database/connection');
const { auth } = require('../middleware/auth');
const { formatNotificationTimestamp } = require('../utils/timezone');
const { sendNotification, sendAutoNotification } = require('../utils/notifications');
const { pushNotificationService } = require('../utils/pushNotifications');
const DatabaseOptimizer = require('../utils/databaseOptimization');
const getIO = () => require('../server').io;

const router = express.Router();

// All routes require authentication
router.use(auth);

// @route   GET /api/notifications
// @desc    Get all notifications for the logged-in user with pagination
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, type } = req.query;

    // Use optimized database query
    const result = await DatabaseOptimizer.getNotificationsWithPagination(
      req.user.id, 
      req.user.role, 
      { page: parseInt(page), limit: parseInt(limit), type }
    );

    // Format timestamps to IST and add relative time
    const formattedNotifications = result.notifications.map(notification => {
      try {
        const timestampData = formatNotificationTimestamp(notification.created_at);
        
        return {
          ...notification,
          ...timestampData
        };
      } catch (error) {
        console.error('Error formatting timestamp for notification:', notification.id, error);
        // Fallback formatting
        const date = new Date(notification.created_at);
        return {
          ...notification,
          formatted_date: date.toLocaleDateString('en-IN'),
          formatted_time: date.toLocaleTimeString('en-IN', { 
            hour: '2-digit', 
            minute: '2-digit', 
            hour12: true,
            timeZone: undefined // Remove timezone information
          }),
          relative_time: 'Recently'
        };
      }
    });

    res.json({
      status: 'success',
      data: { 
        notifications: formattedNotifications,
        pagination: result.pagination
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/notifications/unread-count
// @desc    Get unread notification count for the logged-in user
// @access  Private
router.get('/unread-count', async (req, res) => {
  try {
    const result = await getRows(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND role = $2 AND is_read = FALSE`,
      [req.user.id, req.user.role]
    );

    const unreadCount = parseInt(result[0]?.count || 0);

    res.json({
      status: 'success',
      data: { unreadCount }
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/notifications/:id/mark-read
// @desc    Mark a specific notification as read
// @access  Private
router.put('/:id/mark-read', async (req, res) => {
  try {
    const { id } = req.params;
    
    await require('../database/connection').query(
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 AND role = $3`,
      [id, req.user.id, req.user.role]
    );

    res.json({ 
      status: 'success', 
      message: 'Notification marked as read' 
    });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Internal server error' 
    });
  }
});

// @route   PUT /api/notifications/mark-all-read
// @desc    Mark all notifications as read for the logged-in user
// @access  Private
router.put('/mark-all-read', async (req, res) => {
  try {
    await require('../database/connection').query(
      `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND role = $2`,
      [req.user.id, req.user.role]
    );
    res.json({ status: 'success', message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

// @route   GET /api/notifications/history
// @desc    Get notification history with advanced filtering
// @access  Private
router.get('/history', async (req, res) => {
  try {
    const { page = 1, limit = 50, type, dateFrom, dateTo, readStatus } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE user_id = $1 AND role = $2';
    let queryParams = [req.user.id, req.user.role];
    let paramCount = 3;
    
    // Add type filter if provided
    if (type) {
      whereClause += ` AND title ILIKE $${paramCount}`;
      queryParams.push(`%${type}%`);
      paramCount++;
    }
    
    // Add date range filter if provided
    if (dateFrom) {
      whereClause += ` AND created_at >= $${paramCount}`;
      queryParams.push(dateFrom);
      paramCount++;
    }
    
    if (dateTo) {
      whereClause += ` AND created_at <= $${paramCount}`;
      queryParams.push(dateTo);
      paramCount++;
    }
    
    // Add read status filter if provided
    if (readStatus === 'read') {
      whereClause += ` AND is_read = TRUE`;
    } else if (readStatus === 'unread') {
      whereClause += ` AND is_read = FALSE`;
    }
    
    // Get notifications with pagination
    const notifications = await getRows(
      `SELECT id, title, message, is_read, created_at, role 
       FROM notifications 
       ${whereClause} 
       ORDER BY created_at DESC 
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...queryParams, limit, offset]
    );
    
    // Get total count for pagination
    const countResult = await getRows(
      `SELECT COUNT(*) as total FROM notifications ${whereClause}`,
      queryParams
    );
    const totalCount = parseInt(countResult[0]?.total || 0);
    
    // Get notification statistics
    const statsResult = await getRows(
      `SELECT 
         COUNT(*) as total,
         COUNT(CASE WHEN is_read = FALSE THEN 1 END) as unread,
         COUNT(CASE WHEN title ILIKE '%Booking%' THEN 1 END) as booking_notifications,
         COUNT(CASE WHEN title ILIKE '%Rating%' THEN 1 END) as rating_notifications,
         COUNT(CASE WHEN title ILIKE '%Report%' THEN 1 END) as report_notifications,
         COUNT(CASE WHEN title ILIKE '%Welcome%' THEN 1 END) as welcome_notifications
       FROM notifications 
       WHERE user_id = $1 AND role = $2`,
      [req.user.id, req.user.role]
    );
    
    // Format timestamps
    const formattedNotifications = notifications.map(notification => {
      try {
        const timestampData = formatNotificationTimestamp(notification.created_at);
        return {
          ...notification,
          ...timestampData
        };
      } catch (error) {
        console.error('Error formatting timestamp for notification:', notification.id, error);
        const date = new Date(notification.created_at);
        return {
          ...notification,
          formatted_date: date.toLocaleDateString('en-IN'),
          formatted_time: date.toLocaleTimeString('en-IN', { 
            hour: '2-digit', 
            minute: '2-digit', 
            hour12: true 
          }),
          relative_time: 'Recently'
        };
      }
    });

    res.json({
      status: 'success',
      data: { 
        notifications: formattedNotifications,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          hasMore: parseInt(page) * limit < totalCount
        },
        statistics: statsResult[0]
      }
    });
  } catch (error) {
    console.error('Get notification history error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/notifications/recent
// @desc    Get recent notifications since timestamp (for polling)
// @access  Private
router.get('/recent', async (req, res) => {
  try {
    const { since = 0 } = req.query;
    const sinceTimestamp = new Date(parseInt(since));
    
    const notifications = await getRows(`
      SELECT 
        id,
        title,
        message,
        created_at,
        is_read,
        'push_notification' as source
      FROM notifications
      WHERE user_id = $1 
      AND role = $2
      AND created_at > $3
      ORDER BY created_at DESC
      LIMIT 50
    `, [req.user.id, req.user.role, sinceTimestamp]);

    // Format timestamps for each notification
    const formattedNotifications = notifications.map(notification => {
      const timestampData = formatNotificationTimestamp(notification.created_at);
      return {
        ...notification,
        ...timestampData
      };
    });

    res.json({
      status: 'success',
      data: {
        notifications: formattedNotifications,
        count: formattedNotifications.length,
        since: since
      }
    });
  } catch (error) {
    console.error('Error fetching recent notifications:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

module.exports = router; 