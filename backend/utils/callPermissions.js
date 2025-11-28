const { getRow } = require('../database/connection');
const { WebRTCPermissionError } = require('./errorTypes');

const ALLOWED_BOOKING_STATUSES = new Set(['pending', 'accepted', 'in_progress']);

async function fetchBookingForCaller(bookingId, callerId) {
  return await getRow(`
    SELECT 
      b.id,
      b.status,
      b.provider_service_id,
      b.appointment_date,
      b.appointment_time,
      u_customer.id                AS customer_id,
      u_customer.full_name         AS customer_name,
      u_customer.phone             AS customer_phone,
      u_customer.is_verified       AS customer_verified,
      u_provider_user.id           AS provider_id,
      u_provider_user.full_name    AS provider_name,
      u_provider_user.phone        AS provider_phone,
      u_provider_user.is_verified  AS provider_verified,
      sm.name                      AS service_name,
      ps.payment_status            AS provider_payment_status
    FROM bookings b
    JOIN users u_customer ON b.user_id = u_customer.id
    JOIN provider_services ps ON b.provider_service_id = ps.id
    JOIN provider_profiles pp ON ps.provider_id = pp.id
    JOIN users u_provider_user ON pp.user_id = u_provider_user.id
    JOIN services_master sm ON ps.service_id = sm.id
    WHERE b.id = $1 AND (b.user_id = $2 OR pp.user_id = $2)
  `, [bookingId, callerId]);
}

function buildParticipant(booking, role) {
  if (role === 'user') {
    return {
      id: booking.customer_id,
      name: booking.customer_name,
      phone: booking.customer_phone,
      isVerified: booking.customer_verified,
      role: 'user'
    };
  }

  return {
    id: booking.provider_id,
    name: booking.provider_name,
    phone: booking.provider_phone,
    isVerified: booking.provider_verified,
    role: 'provider'
  };
}

function validateParticipant(participant, context) {
  if (!participant.phone) {
    throw new WebRTCPermissionError(`${context} is missing a verified phone number`, `${context.toUpperCase().replace(/ /g, '_')}_PHONE_MISSING`);
  }

  if (!participant.isVerified) {
    throw new WebRTCPermissionError(`${context} must complete verification to place calls`, `${context.toUpperCase().replace(/ /g, '_')}_NOT_VERIFIED`);
  }
}

async function validateCallPermissions({ bookingId, callerId, providedCallerType }) {
  const booking = await fetchBookingForCaller(bookingId, callerId);

  if (!booking) {
    throw new WebRTCPermissionError('Booking not found or access denied', 'CALL_BOOKING_NOT_FOUND');
  }

  if (!ALLOWED_BOOKING_STATUSES.has(booking.status)) {
    throw new WebRTCPermissionError('Calls are only allowed for active bookings', 'CALL_STATUS_NOT_ALLOWED');
  }

  const callerRole = booking.customer_id === callerId ? 'user' : 'provider';
  const caller = buildParticipant(booking, callerRole);
  const receiver = buildParticipant(booking, callerRole === 'user' ? 'provider' : 'user');

  if (providedCallerType && providedCallerType !== caller.role) {
    throw new WebRTCPermissionError('Invalid caller type provided for booking', 'CALLER_ROLE_MISMATCH');
  }

  if (caller.id === receiver.id) {
    throw new WebRTCPermissionError('Caller and receiver cannot be the same account', 'CALL_SELF_NOT_ALLOWED');
  }

  validateParticipant(caller, 'Caller');
  validateParticipant(receiver, 'Receiver');

  if (caller.role === 'user' && booking.provider_payment_status !== 'active') {
    throw new WebRTCPermissionError('Provider is unavailable for calls at this time', 'PROVIDER_CALLS_DISABLED');
  }

  return {
    booking,
    caller,
    receiver,
    metadata: {
      serviceName: booking.service_name || 'Service Call'
    }
  };
}

module.exports = {
  validateCallPermissions,
};
