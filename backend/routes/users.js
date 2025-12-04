const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, getRow, getRows } = require('../database/connection');
const { auth, requireRole } = require('../middleware/auth');
const { uploadImage } = require('../utils/cloudinary');
const logger = require('../utils/logger');
const { profileUpdateLimiter, accountDeletionLimiter, standardLimiter } = require('../middleware/rateLimiting');
const { sanitizeBody } = require('../middleware/inputSanitization');
const { blacklistAllUserTokens } = require('../utils/tokenBlacklist');
const { invalidateAllUserSessions } = require('../utils/sessionManager');
const { logSecurityEvent } = require('../utils/securityAudit');
const { asyncHandler } = require('../middleware/errorHandler');
const { NotFoundError, ValidationError } = require('../utils/errorTypes');
const { validateOrThrow, throwIfMissing } = require('../utils/errorHelpers');

const router = express.Router();

// All routes require authentication
router.use(auth);

// Apply input sanitization to all routes
router.use(sanitizeBody());

// @route   DELETE /api/users/delete-account
// @desc    Delete the current user's account and all related data (revokes all sessions)
// @access  Private
router.delete('/delete-account', accountDeletionLimiter, asyncHandler(async (req, res) => {
  const ipAddress = req.ip || 'unknown';
  const userAgent = req.headers['user-agent'] || '';
  
  const userId = req.user.id;
    
    // Get all images that need to be deleted from Cloudinary
    const imagesToDelete = [];
    
    // Get profile picture
    if (req.user.profile_pic_url && req.user.profile_pic_url.includes('cloudinary.com')) {
      imagesToDelete.push(req.user.profile_pic_url);
    }
    
    // Get provider profile images
    const providerProfile = await getRow('SELECT * FROM provider_profiles WHERE user_id = $1', [userId]);
    if (providerProfile) {
      if (providerProfile.engineering_certificate_url && providerProfile.engineering_certificate_url.includes('cloudinary.com')) {
        imagesToDelete.push(providerProfile.engineering_certificate_url);
      }
      
      // Get provider services images
      const providerServices = await getRows('SELECT * FROM provider_services WHERE provider_id = $1', [providerProfile.id]);
      providerServices.forEach(service => {
        if (service.working_proof_urls && service.working_proof_urls.length > 0) {
          service.working_proof_urls.forEach(url => {
            if (url.includes('cloudinary.com')) {
              imagesToDelete.push(url);
            }
          });
        }
      });
    }
    
    // Delete images from Cloudinary if any exist
    if (imagesToDelete.length > 0) {
      logger.info('Deleting images from Cloudinary', {
        count: imagesToDelete.length
      });
      
      // Extract public IDs from Cloudinary URLs
      const publicIds = imagesToDelete.map(url => {
        const urlParts = url.split('/');
        const uploadIndex = urlParts.indexOf('upload');
        if (uploadIndex !== -1 && uploadIndex + 2 < urlParts.length) {
          const folderAndFile = urlParts.slice(uploadIndex + 2).join('/');
          return folderAndFile.replace(/\.[^/.]+$/, '');
        }
        return null;
      }).filter(Boolean);

      if (publicIds.length > 0) {
        const { deleteMultipleImages } = require('../utils/cloudinary');
        const deleteResult = await deleteMultipleImages(publicIds);
        if (deleteResult.success) {
          logger.info('Successfully deleted images from Cloudinary', {
            count: deleteResult.deleted
          });
        } else {
          logger.error('Failed to delete some images from Cloudinary', {
            errors: deleteResult.errors
          });
        }
      }
    }
    
    // Forcefully delete all user-related data from all tables
    // Delete from notifications (ensure all notifications for this user are deleted)
    await query('DELETE FROM notifications WHERE user_id = $1', [userId]);
    // Delete from ratings
    await query('DELETE FROM ratings WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = $1)', [userId]);
    // Delete from bookings (as user)
    await query('DELETE FROM bookings WHERE user_id = $1', [userId]);
    // Delete from bookings (as provider)
    const providerProfile2 = await getRow('SELECT * FROM provider_profiles WHERE user_id = $1', [userId]);
    if (providerProfile2) {
      const providerServices2 = await getRows('SELECT * FROM provider_services WHERE provider_id = $1', [providerProfile2.id]);
      for (const service of providerServices2) {
        await query('DELETE FROM ratings WHERE booking_id IN (SELECT id FROM bookings WHERE provider_service_id = $1)', [service.id]);
        await query('DELETE FROM bookings WHERE provider_service_id = $1', [service.id]);
      }
      await query('DELETE FROM provider_services WHERE provider_id = $1', [providerProfile2.id]);
      await query('DELETE FROM provider_profiles WHERE id = $1', [providerProfile2.id]);
    }
    // Delete addresses
    await query('DELETE FROM addresses WHERE user_id = $1', [userId]);
    
    // Revoke all sessions and blacklist all tokens before deleting user
    await blacklistAllUserTokens(userId, 'account_deletion');
    await invalidateAllUserSessions(userId);
    
    // Log security event before deletion
    await logSecurityEvent(
      userId,
      'account_deletion',
      `Account deleted by user from ${ipAddress}`,
      ipAddress,
      userAgent,
      'warning'
    );
    
    // Delete user (CASCADE will handle related auth security tables)
    await query('DELETE FROM users WHERE id = $1', [userId]);
    
  res.json({
    status: 'success',
    message: 'Account and all related data deleted successfully.'
  });
}));

// @route   GET /api/users/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', asyncHandler(async (req, res) => {
  const user = await getRow('SELECT * FROM users WHERE id = $1', [req.user.id]);
  
  res.json({
    status: 'success',
    data: {
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.is_verified,
        profilePicUrl: user.profile_pic_url,
        createdAt: user.created_at
      }
    }
  });
}));

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', [
  profileUpdateLimiter,
  body('fullName').optional().trim().isLength({ min: 2 }).withMessage('Full name must be at least 2 characters'),
  body('email').optional().isEmail().withMessage('Please enter a valid email'),
  body('profilePicUrl').optional().isString().withMessage('Profile picture URL must be a string')
], asyncHandler(async (req, res) => {
  validateOrThrow(req);

  const { fullName, email, profilePicUrl } = req.body;
  const updateFields = [];
  const updateValues = [];
  let paramCount = 1;

  if (fullName) {
    updateFields.push(`full_name = $${paramCount}`);
    updateValues.push(fullName);
    paramCount++;
  }

  if (email) {
    // Check if email is already taken by another user
    const existingUser = await getRow('SELECT id FROM users WHERE email = $1 AND id != $2', [email, req.user.id]);
    if (existingUser) {
      throw new ValidationError('Email already taken by another user');
    }
    updateFields.push(`email = $${paramCount}`);
    updateValues.push(email);
    paramCount++;
  }

    // Handle profile picture upload to Cloudinary
    if (profilePicUrl !== undefined) {
      // Profile picture debug logging removed for production
      
      // Handle profile picture deletion (empty string or null)
      if (profilePicUrl === '' || profilePicUrl === null) {
        // Profile picture deletion logging removed for production
        
        // Delete old profile picture from Cloudinary if it exists
        if (req.user.profile_pic_url && req.user.profile_pic_url.includes('cloudinary.com')) {
          logger.info('Deleting profile picture from Cloudinary');
          const { deleteImage } = require('../utils/cloudinary');
          
          // Extract public ID from Cloudinary URL
          const urlParts = req.user.profile_pic_url.split('/');
          const uploadIndex = urlParts.indexOf('upload');
          if (uploadIndex !== -1 && uploadIndex + 2 < urlParts.length) {
            const folderAndFile = urlParts.slice(uploadIndex + 2).join('/');
            const publicId = folderAndFile.replace(/\.[^/.]+$/, '');
            
            const deleteResult = await deleteImage(publicId);
            if (deleteResult.success) {
              logger.info('Successfully deleted profile picture from Cloudinary');
            } else {
              logger.error('Failed to delete profile picture from Cloudinary', {
                error: deleteResult.error
              });
            }
          }
        }
        
        updateFields.push(`profile_pic_url = $${paramCount}`);
        updateValues.push('');
        paramCount++;
        // Profile picture deletion logging removed for production
      } else {
        // Handle profile picture upload (new image)
        let cloudinaryUrl = profilePicUrl;
        
        // Check if it's a new image that needs to be uploaded (base64 or file URI)
        if (profilePicUrl.startsWith('data:image/') || profilePicUrl.startsWith('file://')) {
          logger.info('Uploading profile picture to Cloudinary');
          const uploadResult = await uploadImage(profilePicUrl, 'buildxpert/profile-pictures');
          
          if (uploadResult.success) {
            cloudinaryUrl = uploadResult.url;
            logger.info('Successfully uploaded profile picture to Cloudinary');
            
            // Delete old profile picture from Cloudinary if it exists
            if (req.user.profile_pic_url && req.user.profile_pic_url.includes('cloudinary.com')) {
              logger.info('Deleting old profile picture from Cloudinary');
              const { deleteImage } = require('../utils/cloudinary');
              
              // Extract public ID from old Cloudinary URL
              const urlParts = req.user.profile_pic_url.split('/');
              const uploadIndex = urlParts.indexOf('upload');
              if (uploadIndex !== -1 && uploadIndex + 2 < urlParts.length) {
                const folderAndFile = urlParts.slice(uploadIndex + 2).join('/');
                const publicId = folderAndFile.replace(/\.[^/.]+$/, '');
                
                const deleteResult = await deleteImage(publicId);
                if (deleteResult.success) {
                  logger.info('Successfully deleted old profile picture from Cloudinary');
                } else {
                  logger.error('Failed to delete old profile picture from Cloudinary', {
                    error: deleteResult.error
                  });
                }
              }
            }
          } else {
            logger.error('Failed to upload profile picture to Cloudinary', {
              error: uploadResult.error
            });
            throw new Error('Failed to upload profile picture');
          }
        }
        
        updateFields.push(`profile_pic_url = $${paramCount}`);
        updateValues.push(cloudinaryUrl);
        paramCount++;
      }
  }

  if (updateFields.length === 0) {
    throw new ValidationError('No fields to update');
  }

  updateValues.push(req.user.id);
  // Debug query logging removed for production
  
  const result = await query(`
    UPDATE users 
    SET ${updateFields.join(', ')}
    WHERE id = $${paramCount}
    RETURNING id, full_name, email, phone, role, is_verified, profile_pic_url, created_at
  `, updateValues);

  const updatedUser = result.rows[0];
  // Profile picture update logging removed for production

  res.json({
    status: 'success',
    message: 'Profile updated successfully',
    data: {
      user: {
        id: updatedUser.id,
        fullName: updatedUser.full_name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        role: updatedUser.role,
        isVerified: updatedUser.is_verified,
        profilePicUrl: updatedUser.profile_pic_url,
        createdAt: updatedUser.created_at
      }
    }
  });
}));

// @route   GET /api/users/addresses
// @desc    Get user addresses with pagination
// @access  Private
router.get('/addresses', asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  // Validate pagination
  if (isNaN(pageNum) || pageNum < 1) {
    throw new ValidationError('page must be a positive integer');
  }
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    throw new ValidationError('limit must be a positive integer between 1 and 100');
  }

  // Get total count
  const countResult = await getRow(`
    SELECT COUNT(*) as total
    FROM addresses 
    WHERE user_id = $1
  `, [req.user.id]);
  const total = parseInt(countResult?.total || 0, 10);
  const totalPages = Math.ceil(total / limitNum);

  // Get paginated addresses
  const addresses = await getRows(`
    SELECT id, type, state, full_address, created_at
    FROM addresses 
    WHERE user_id = $1 
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `, [req.user.id, limitNum, offset]);

  res.json({
    status: 'success',
    data: { 
      addresses,
      pagination: {
        currentPage: pageNum,
        totalPages,
        total,
        limit: limitNum,
        hasMore: pageNum < totalPages
      }
    }
  });
}));

// @route   POST /api/users/addresses
// @desc    Add new address
// @access  Private
router.post('/addresses', [
  body('type').isIn(['home', 'office', 'other']).withMessage('Type must be home, office, or other'),
  body('state').notEmpty().withMessage('State is required'),
  body('city').optional().notEmpty().withMessage('City cannot be empty'),
  body('fullAddress').notEmpty().withMessage('Full address is required')
], asyncHandler(async (req, res) => {
  validateOrThrow(req);

  const { type, state, city, fullAddress } = req.body;

  // Check if user already has 3 addresses
  const addressCount = await getRow('SELECT COUNT(*) as count FROM addresses WHERE user_id = $1', [req.user.id]);
  if (parseInt(addressCount.count) >= 3) {
    throw new ValidationError('Maximum 3 addresses allowed per user');
  }

  const result = await query(`
    INSERT INTO addresses (user_id, type, state, city, full_address)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, type, state, city, full_address, created_at
  `, [req.user.id, type, state, city || null, fullAddress]);

  const newAddress = result.rows[0];

  res.status(201).json({
    status: 'success',
    message: 'Address added successfully',
    data: { address: newAddress }
  });
}));

// @route   PUT /api/users/addresses/:id
// @desc    Update address
// @access  Private
router.put('/addresses/:id', [
  body('type').optional().isIn(['home', 'office', 'other']).withMessage('Type must be home, office, or other'),
  body('state').optional().notEmpty().withMessage('State cannot be empty'),
  body('city').optional().notEmpty().withMessage('City cannot be empty'),
  body('fullAddress').optional().notEmpty().withMessage('Full address cannot be empty')
], asyncHandler(async (req, res) => {
  validateOrThrow(req);

  const { id } = req.params;
  const { type, state, city, fullAddress } = req.body;

  // Check if address belongs to user
  const existingAddress = await getRow('SELECT * FROM addresses WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (!existingAddress) {
    throw new NotFoundError('Address', id);
  }

  const updateFields = [];
  const updateValues = [];
  let paramCount = 1;

  if (type) {
    updateFields.push(`type = $${paramCount}`);
    updateValues.push(type);
    paramCount++;
  }

  if (state) {
    updateFields.push(`state = $${paramCount}`);
    updateValues.push(state);
    paramCount++;
  }

  if (city !== undefined) {
    updateFields.push(`city = $${paramCount}`);
    updateValues.push(city || null);
    paramCount++;
  }

  if (fullAddress) {
    updateFields.push(`full_address = $${paramCount}`);
    updateValues.push(fullAddress);
    paramCount++;
  }

  if (updateFields.length === 0) {
    throw new ValidationError('No fields to update');
  }

  updateValues.push(id, req.user.id);
  const result = await query(`
    UPDATE addresses 
    SET ${updateFields.join(', ')}
    WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
    RETURNING id, type, state, city, full_address, created_at
  `, updateValues);

  const updatedAddress = result.rows[0];

  res.json({
    status: 'success',
    message: 'Address updated successfully',
    data: { address: updatedAddress }
  });
}));

// @route   DELETE /api/users/addresses/:id
// @desc    Delete address
// @access  Private
router.delete('/addresses/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check if address belongs to user
  const existingAddress = await getRow('SELECT * FROM addresses WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (!existingAddress) {
    throw new NotFoundError('Address', id);
  }

  await query('DELETE FROM addresses WHERE id = $1 AND user_id = $2', [id, req.user.id]);

  res.json({
    status: 'success',
    message: 'Address deleted successfully'
  });
}));

module.exports = router; 