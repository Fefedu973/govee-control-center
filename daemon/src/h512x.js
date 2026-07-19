import crypto from 'node:crypto';

const SUPPORTED_MODELS = new Map([
  [8, { model: 'H5122', buttonCount: 1 }],
  [10, { model: 'H5125', buttonCount: 6 }],
  [11, { model: 'H5126', buttonCount: 2 }],
]);

export function calculateCrc(data) {
  let crc = 0x1d0f;
  for (const byte of data) {
    for (let shift = 7; shift >= 0; shift -= 1) {
      const mask = (crc >> 15) ^ ((byte >> shift) & 1) ? 0x1021 : 0;
      crc = ((crc << 1) ^ mask) & 0xffff;
    }
  }
  return crc;
}

function decryptPayload(timeBytes, encrypted) {
  const key = Buffer.concat([Buffer.from(timeBytes), Buffer.alloc(12)]).reverse();
  const decipher = crypto.createDecipheriv('aes-128-ecb', key, null);
  decipher.setAutoPadding(false);
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted).reverse()),
    decipher.final(),
  ]).reverse();
}

export function manufacturerCandidates(advertisement) {
  const data = advertisement?.manufacturerData;
  if (!Buffer.isBuffer(data)) return [];

  const candidates = [];
  if (data.length >= 26) candidates.push(data.subarray(2));
  candidates.push(data);
  return candidates;
}

export function parseH512xAdvertisement({ address, localName = '', rssi = null, manufacturerData }) {
  if (!Buffer.isBuffer(manufacturerData)) return null;

  let data = manufacturerData;
  if (data.length > 25 && data.includes(Buffer.from('INTELLI_ROCKS'))) {
    data = data.subarray(0, -25);
  }
  if (data.length !== 24) return null;

  const timeBytes = data.subarray(2, 6);
  const encrypted = data.subarray(6, 22);
  if (calculateCrc(encrypted) !== data.readUInt16BE(22)) return null;

  let decrypted;
  try {
    decrypted = decryptPayload(timeBytes, encrypted);
  } catch {
    return null;
  }

  const info = SUPPORTED_MODELS.get(decrypted[2]);
  if (!info) return null;

  const button = decrypted[5];
  if (button >= info.buttonCount) return null;

  const normalizedAddress = String(address || '').toLowerCase();
  return {
    sensor: {
      address: normalizedAddress,
      name: localName || info.model,
      model: info.model,
      buttonCount: info.buttonCount,
      battery: decrypted[4],
      rssi: typeof rssi === 'number' ? rssi : null,
    },
    event: {
      id: timeBytes.toString('hex'),
      counter: timeBytes.readUInt32BE(0),
      button,
    },
  };
}
