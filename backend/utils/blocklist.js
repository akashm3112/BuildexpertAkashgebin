const { query, getRow } = require('../database/connection');
const logger = require('./logger');

const normalizePhoneNumber = (value) => {
  if (!value) return null;
  let sanitized = `${value}`.trim();
  sanitized = sanitized.replace(/\D/g, '');

  if (sanitized.length > 10) {
    // Remove common country codes while preserving the last 10 digits
    if (sanitized.startsWith('91') && sanitized.length === 12) {
      sanitized = sanitized.slice(2);
    } else if (sanitized.startsWith('1') && sanitized.length === 11) {
      sanitized = sanitized.slice(1);
    } else {
      sanitized = sanitized.slice(-10);
    }
  }

  return sanitized;
};

const normalizeEmail = (value) => {
  if (!value) return null;
  return value.trim().toLowerCase();
};

const isIdentifierBlocked = async ({ identifierType, identifierValue, role }) => {
  if (!identifierValue) return null;

  try {
    const record = await getRow(
      `
        SELECT *
        FROM blocked_identifiers
        WHERE identifier_type = $1
          AND identifier_value = $2
          AND role = $3
      `,
      [identifierType, identifierValue, role]
    );

    return record || null;
  } catch (error) {
    logger.error('Blocked identifier lookup failed', {
      error: error.message,
      identifierType,
      role
    });
    throw error;
  }
};

const isAnyIdentifierBlocked = async ({ phone, email, role }) => {
  const normalizedPhone = normalizePhoneNumber(phone);
  const normalizedEmail = normalizeEmail(email);

  if (normalizedPhone) {
    const blockedPhone = await isIdentifierBlocked({
      identifierType: 'phone',
      identifierValue: normalizedPhone,
      role
    });
    if (blockedPhone) {
      return {
        ...blockedPhone,
        identifier: normalizedPhone,
        identifierType: 'phone'
      };
    }
  }

  if (normalizedEmail) {
    const blockedEmail = await isIdentifierBlocked({
      identifierType: 'email',
      identifierValue: normalizedEmail,
      role
    });
    if (blockedEmail) {
      return {
        ...blockedEmail,
        identifier: normalizedEmail,
        identifierType: 'email'
      };
    }
  }

  return null;
};

const blockIdentifier = async ({
  identifierType,
  identifierValue,
  role,
  reason,
  metadata = {},
  blockedBy
}) => {
  if (!identifierValue) {
    return null;
  }

  const normalizedValue =
    identifierType === 'phone'
      ? normalizePhoneNumber(identifierValue)
      : normalizeEmail(identifierValue);

  if (!normalizedValue) {
    return null;
  }

  try {
    await query(
      `
        INSERT INTO blocked_identifiers (
          identifier_type,
          identifier_value,
          role,
          reason,
          metadata,
          blocked_by
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6)
        ON CONFLICT (identifier_type, identifier_value, role)
        DO UPDATE SET
          reason = EXCLUDED.reason,
          metadata = blocked_identifiers.metadata || EXCLUDED.metadata,
          blocked_by = EXCLUDED.blocked_by,
          blocked_at = NOW(),
          updated_at = NOW()
      `,
      [
        identifierType,
        normalizedValue,
        role,
        reason || null,
        JSON.stringify(metadata || {}),
        blockedBy || null
      ]
    );

    return normalizedValue;
  } catch (error) {
    logger.error('Failed to block identifier', {
      error: error.message,
      identifierType,
      role
    });
    throw error;
  }
};

const blockIdentifiersForAccount = async ({
  phone,
  email,
  roles = ['user', 'provider'],
  reason,
  metadata,
  blockedBy
}) => {
  const results = [];

  for (const role of roles) {
    if (phone) {
      const blockedPhone = await blockIdentifier({
        identifierType: 'phone',
        identifierValue: phone,
        role,
        reason,
        metadata,
        blockedBy
      });
      if (blockedPhone) {
        results.push({ role, identifierType: 'phone', identifierValue: blockedPhone });
      }
    }

    if (email) {
      const blockedEmail = await blockIdentifier({
        identifierType: 'email',
        identifierValue: email,
        role,
        reason,
        metadata,
        blockedBy
      });
      if (blockedEmail) {
        results.push({ role, identifierType: 'email', identifierValue: blockedEmail });
      }
    }
  }

  return results;
};

module.exports = {
  normalizePhoneNumber,
  normalizeEmail,
  isIdentifierBlocked,
  isAnyIdentifierBlocked,
  blockIdentifier,
  blockIdentifiersForAccount
};

