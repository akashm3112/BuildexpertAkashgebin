const { v4: uuidv4 } = require('uuid');
const { ManagedMap, registry } = require('./memoryLeakPrevention');

// Load environment variables
require('dotenv').config({ path: './config.env' });

// OTP Service initialized - console logging enabled for OTP display

// OTP attempt configuration
const MAX_OTP_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds
const ATTEMPT_RESET_DURATION = 15 * 60 * 1000; // Reset attempts after 15 minutes

// Store OTPs in memory with automatic cleanup (in production, use Redis)
const otpStore = new ManagedMap({
  name: 'otpStore',
  ttl: parseInt(process.env.OTP_EXPIRE) || 300000, // 5 minutes
  maxSize: 10000,
  cleanupInterval: 60000 // Clean every minute
});

// Store pending signups in memory with automatic cleanup (for production, use Redis)
const pendingSignups = new ManagedMap({
  name: 'pendingSignups',
  ttl: 600000, // 10 minutes
  maxSize: 5000,
  cleanupInterval: 120000 // Clean every 2 minutes
});

// Store password reset sessions in memory with automatic cleanup (for production, use Redis)
const passwordResetSessions = new ManagedMap({
  name: 'passwordResetSessions',
  ttl: 600000, // 10 minutes
  maxSize: 5000,
  cleanupInterval: 120000 // Clean every 2 minutes
});

// Store OTP attempt tracking (in production, use Redis)
const otpAttempts = new ManagedMap({
  name: 'otpAttempts',
  ttl: LOCKOUT_DURATION, // 15 minutes
  maxSize: 10000,
  cleanupInterval: 300000 // Clean every 5 minutes
});

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const formatLockoutDuration = (totalSeconds) => {
  const seconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const parts = [];

  if (minutes > 0) {
    parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  }

  if (remainingSeconds > 0) {
    parts.push(`${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'}`);
  }

  if (!parts.length) {
    parts.push('a few seconds');
  }

  return parts.join(' and ');
};

const buildLockoutMessage = (seconds) => {
  return `Too many failed attempts. Please wait ${formatLockoutDuration(seconds)} before retrying.`;
};

// Check if phone number is locked due to too many attempts
const isPhoneLocked = (phoneNumber) => {
  const attemptData = otpAttempts.get(phoneNumber);
  if (!attemptData) return false;

  const now = Date.now();

  // Reset attempts if enough time has passed since first attempt
  if (now - attemptData.firstAttemptTime > ATTEMPT_RESET_DURATION) {
    otpAttempts.delete(phoneNumber);
    return false;
  }

  // Check if currently locked
  if (attemptData.lockedUntil && now < attemptData.lockedUntil) {
    return true;
  }

  return false;
};

// Record an OTP attempt
const recordOTPAttempt = (phoneNumber, success = false) => {
  const now = Date.now();
  const attemptData = otpAttempts.get(phoneNumber) || {
    attempts: 0,
    firstAttemptTime: now,
    lockedUntil: null
  };

  // Reset if enough time has passed
  if (now - attemptData.firstAttemptTime > ATTEMPT_RESET_DURATION) {
    attemptData.attempts = 0;
    attemptData.firstAttemptTime = now;
    attemptData.lockedUntil = null;
  }

  if (!success) {
    attemptData.attempts += 1;
    
    // Lock if max attempts reached
    if (attemptData.attempts >= MAX_OTP_ATTEMPTS) {
      attemptData.lockedUntil = now + LOCKOUT_DURATION;
    }
  } else {
    // Reset attempts on successful verification
    otpAttempts.delete(phoneNumber);
    return;
  }

  otpAttempts.set(phoneNumber, attemptData);
};

// Get remaining attempts for a phone number
const getRemainingAttempts = (phoneNumber) => {
  const attemptData = otpAttempts.get(phoneNumber);
  if (!attemptData) return MAX_OTP_ATTEMPTS;

  const now = Date.now();
  
  // Reset if enough time has passed
  if (now - attemptData.firstAttemptTime > ATTEMPT_RESET_DURATION) {
    otpAttempts.delete(phoneNumber);
    return MAX_OTP_ATTEMPTS;
  }

  return Math.max(0, MAX_OTP_ATTEMPTS - attemptData.attempts);
};

// Get lockout time remaining
const getLockoutTimeRemaining = (phoneNumber) => {
  const attemptData = otpAttempts.get(phoneNumber);
  if (!attemptData || !attemptData.lockedUntil) return 0;

  const now = Date.now();
  const remaining = attemptData.lockedUntil - now;
  
  if (remaining <= 0) {
    otpAttempts.delete(phoneNumber);
    return 0;
  }

  return Math.ceil(remaining / 1000); // Return seconds
};

// Helper function to format phone number with country code
const formatPhoneNumber = (phoneNumber) => {
  // Remove any existing country code or special characters
  const cleanNumber = phoneNumber.replace(/^\+/, '').replace(/^1/, '').replace(/^91/, '');
  
  // Get default country code from environment or use 1 (US) as fallback
  const defaultCountryCode = process.env.DEFAULT_COUNTRY_CODE || '1';
  
  // If the number is 10 digits and starts with 6-9, it's likely an Indian number
  if (cleanNumber.length === 10 && /^[6-9]/.test(cleanNumber)) {
    return `+91${cleanNumber}`;
  }
  
  // For US numbers: should be 10 digits and start with 2-9 (area codes don't start with 0 or 1)
  if (cleanNumber.length === 10 && /^[2-9]/.test(cleanNumber)) {
    return `+1${cleanNumber}`;
  }
  
  // Default to configured country code if no specific pattern matches
  return `+${defaultCountryCode}${cleanNumber}`;
};

const sendOTP = async (phoneNumber, otp) => {
  const { breakers } = require('./circuitBreaker');
  const { withSmsRetry } = require('./retryLogic');
  const { SmsDeliveryError, SmsRateLimitError } = require('./errorTypes');
  
  try {
    // Check if phone is locked
    if (isPhoneLocked(phoneNumber)) {
      const lockoutTime = getLockoutTimeRemaining(phoneNumber);
      return {
        success: false,
        error: buildLockoutMessage(lockoutTime)
      };
    }

    // Format phone number with appropriate country code
    const formattedPhoneNumber = formatPhoneNumber(phoneNumber);
    
    // Attempt to send via circuit breaker with retry logic
    const sendWithProtection = async () => {
      return await breakers.sms.execute(
        async () => {
          // Log OTP to console (for development/testing)
          console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('📱 OTP VERIFICATION CODE');
          console.log(`Phone: ${formattedPhoneNumber}`);
          console.log(`Code: ${otp}`);
          console.log('Message: Your BuildXpert verification code is: ' + otp);
          console.log('Valid for: 5 minutes');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
          
          // Return success (OTP is logged for manual entry)
          return { success: true, method: 'console' };
        },
        // Fallback: still log OTP even if circuit is open
        async () => {
          console.log(`📱 [FALLBACK] OTP for ${formattedPhoneNumber}: ${otp}`);
          return { success: true, method: 'console-fallback' };
        }
      );
    };
    
    // Execute with retry logic
    return await withSmsRetry(sendWithProtection, `send OTP to ${phoneNumber}`);
    
  } catch (error) {
    console.error('❌ Failed to send OTP after all retries:', error.message);
    const formattedPhoneNumber = formatPhoneNumber(phoneNumber);
    console.log(`📱 [ERROR] OTP for ${formattedPhoneNumber}: ${otp} (logged due to error)`);
    
    // Return success anyway - OTP is logged
    return { success: true, method: 'console-error', error: error.message };
  }
};

const storeOTP = (phoneNumber, otp) => {
  const expiryTime = Date.now() + parseInt(process.env.OTP_EXPIRE);
  otpStore.set(phoneNumber, { otp, expiryTime });
};

const verifyOTP = (phoneNumber, otp) => {
  // Check if phone is locked
  if (isPhoneLocked(phoneNumber)) {
    const lockoutTime = getLockoutTimeRemaining(phoneNumber);
    return {
      valid: false,
      message: buildLockoutMessage(lockoutTime),
      locked: true,
      lockoutTimeRemaining: lockoutTime
    };
  }

  const storedData = otpStore.get(phoneNumber);
  
  if (!storedData) {
    recordOTPAttempt(phoneNumber, false);
    return { 
      valid: false, 
      message: 'OTP not found or expired',
      remainingAttempts: getRemainingAttempts(phoneNumber)
    };
  }

  if (Date.now() > storedData.expiryTime) {
    otpStore.delete(phoneNumber);
    recordOTPAttempt(phoneNumber, false);
    return { 
      valid: false, 
      message: 'OTP expired',
      remainingAttempts: getRemainingAttempts(phoneNumber)
    };
  }

  if (storedData.otp !== otp) {
    recordOTPAttempt(phoneNumber, false);
    const remainingAttempts = getRemainingAttempts(phoneNumber);
    const isLocked = isPhoneLocked(phoneNumber);
    
    if (isLocked) {
      const lockoutTime = getLockoutTimeRemaining(phoneNumber);
      return {
        valid: false,
        message: buildLockoutMessage(lockoutTime),
        locked: true,
        lockoutTimeRemaining: lockoutTime
      };
    }
    
    return { 
      valid: false, 
      message: `Invalid OTP. ${remainingAttempts} attempts remaining`,
      remainingAttempts
    };
  }

  // Remove OTP after successful verification
  otpStore.delete(phoneNumber);
  recordOTPAttempt(phoneNumber, true); // Reset attempts on success
  return { valid: true, message: 'OTP verified successfully' };
};

const resendOTP = async (phoneNumber) => {
  // Check if phone is locked
  if (isPhoneLocked(phoneNumber)) {
    const lockoutTime = getLockoutTimeRemaining(phoneNumber);
    const minutes = Math.floor(lockoutTime / 60);
    const seconds = lockoutTime % 60;
    return { 
      success: false, 
      message: `Too many failed attempts. Please try again in ${minutes}:${seconds.toString().padStart(2, '0')}` 
    };
  }

  const newOTP = generateOTP();
  const result = await sendOTP(phoneNumber, newOTP);
  
  if (result.success) {
    storeOTP(phoneNumber, newOTP);
    return { success: true, message: 'OTP sent successfully' };
  }
  
  return { success: false, message: result.error || 'Failed to send OTP' };
};

const storePendingSignup = (phoneNumber, signupData) => {
  // Use phone+role as key to prevent overwriting different role registrations
  const key = `${phoneNumber}_${signupData.role}`;
  pendingSignups.set(key, signupData);
};

const getPendingSignup = (phoneNumber, role) => {
  // Get pending signup for specific phone and role
  const key = `${phoneNumber}_${role}`;
  return pendingSignups.get(key);
};

const deletePendingSignup = (phoneNumber, role) => {
  // Delete pending signup for specific phone and role
  const key = `${phoneNumber}_${role}`;
  pendingSignups.delete(key);
};

// Create a short-lived password reset session after successful OTP verification
const createPasswordResetSession = (phoneNumber) => {
  const token = uuidv4();
  // Default 10 minutes expiry for reset token
  const expiryTime = Date.now() + 10 * 60 * 1000;
  passwordResetSessions.set(phoneNumber, { token, expiryTime });
  return { token, expiryTime };
};

const validatePasswordResetSession = (phoneNumber, token) => {
  const session = passwordResetSessions.get(phoneNumber);
  if (!session) return { valid: false, message: 'Reset session not found' };
  if (session.token !== token) return { valid: false, message: 'Invalid reset token' };
  if (Date.now() > session.expiryTime) {
    passwordResetSessions.delete(phoneNumber);
    return { valid: false, message: 'Reset token expired' };
  }
  return { valid: true };
};

const consumePasswordResetSession = (phoneNumber) => {
  passwordResetSessions.delete(phoneNumber);
};

module.exports = {
  generateOTP,
  sendOTP,
  storeOTP,
  verifyOTP,
  resendOTP,
  storePendingSignup,
  getPendingSignup,
  deletePendingSignup,
  createPasswordResetSession,
  validatePasswordResetSession,
  consumePasswordResetSession,
  isPhoneLocked,
  getRemainingAttempts,
  getLockoutTimeRemaining
}; 