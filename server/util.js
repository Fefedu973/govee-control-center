export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function httpError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function clampInteger(value, min, max, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw httpError(`${name} must be an integer between ${min} and ${max}`, 400);
  }
  return n;
}

export function normalizeRgb(color = {}) {
  return {
    r: clampInteger(color.r, 0, 255, 'r'),
    g: clampInteger(color.g, 0, 255, 'g'),
    b: clampInteger(color.b, 0, 255, 'b'),
  };
}

export function rgbToInteger({ r, g, b }) {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

export function integerToRgb(value) {
  if (!Number.isInteger(value)) return null;
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

export function validateIpv4(ip) {
  if (typeof ip !== 'string' || !/^([0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip)) {
    throw httpError('ip must be an IPv4 address such as 192.168.1.42', 400);
  }
  if (ip.split('.').some((part) => Number(part) > 255)) {
    throw httpError('ip contains an invalid octet', 400);
  }
  return ip;
}

export function nowIso() {
  return new Date().toISOString();
}
