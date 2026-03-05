import CryptoJS from 'crypto-js';
import { config } from '../config.js';

export function encryptToken(token) {
  return CryptoJS.AES.encrypt(token, config.tokenEncKey).toString();
}

export function decryptToken(tokenEnc) {
  if (!tokenEnc) return null;
  const bytes = CryptoJS.AES.decrypt(tokenEnc, config.tokenEncKey);
  return bytes.toString(CryptoJS.enc.Utf8);
}
