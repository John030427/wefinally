const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function comparePassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

function generateOrderNo() {
  const ts = Date.now().toString();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `WF${ts}${rand}`;
}

function generatePromoteCode() {
  return uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase();
}

function randomNonce(len = 32) {
  return crypto.randomBytes(len).toString('hex').slice(0, len);
}

module.exports = {
  hashPassword,
  comparePassword,
  md5,
  generateOrderNo,
  generatePromoteCode,
  randomNonce,
};
