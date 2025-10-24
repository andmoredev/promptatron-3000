import crypto from 'crypto';

const getKey = () => {
  return crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();
};

export const hash = (data) => {
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
};

export const encrypt = (email) => {
  const key = getKey();
  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv(algorithm, key, iv);

  let encrypted = cipher.update(email, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');

  // Return iv + encrypted + authTag as one string
  return `${iv.toString('base64')}:${encrypted}:${authTag}`;
};

export const decrypt = (encrypted) => {
  const key = getKey();
  const [ivB64, dataB64, authTagB64] = encrypted.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(dataB64, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};
