const { query, getRow, getRows } = require('../database/connection');

// User model helper functions
const findById = async (id) => {
  return await getRow('SELECT * FROM users WHERE id = $1', [id]);
};

const findByPhone = async (phone) => {
  return await getRow('SELECT * FROM users WHERE phone = $1', [phone]);
};

const findByEmail = async (email) => {
  return await getRow('SELECT * FROM users WHERE email = $1', [email]);
};

const findByPhoneOrEmail = async (phone, email) => {
  return await getRow('SELECT * FROM users WHERE phone = $1 OR email = $2', [phone, email]);
};

const createUser = async ({ fullName, email, phone, password, role }) => {
  const result = await query(
    `INSERT INTO users (full_name, email, phone, password, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, full_name, email, phone, role, is_verified`,
    [fullName, email, phone, password, role]
  );
  return result.rows[0];
};

const updateUser = async (id, fields) => {
  // fields: { fullName, email, profilePicUrl, ... }
  const updateFields = [];
  const updateValues = [];
  let paramCount = 1;
  if (fields.fullName) {
    updateFields.push(`full_name = $${paramCount}`);
    updateValues.push(fields.fullName);
    paramCount++;
  }
  if (fields.email) {
    updateFields.push(`email = $${paramCount}`);
    updateValues.push(fields.email);
    paramCount++;
  }
  if (fields.profilePicUrl) {
    updateFields.push(`profile_pic_url = $${paramCount}`);
    updateValues.push(fields.profilePicUrl);
    paramCount++;
  }
  if (updateFields.length === 0) return null;
  updateValues.push(id);
  const result = await query(
    `UPDATE users SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING id, full_name, email, phone, role, is_verified, profile_pic_url, created_at`,
    updateValues
  );
  return result.rows[0];
};

module.exports = {
  findById,
  findByPhone,
  findByEmail,
  findByPhoneOrEmail,
  createUser,
  updateUser,
}; 