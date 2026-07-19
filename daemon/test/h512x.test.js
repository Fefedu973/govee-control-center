import assert from 'node:assert/strict';
import test from 'node:test';
import { manufacturerCandidates, parseH512xAdvertisement } from '../src/h512x.js';

const CAPTURED_H5122_PACKET = Buffer.from(
  'cfa204f80f2679f9200c4f25091aa122105f1aec07037c4f',
  'hex',
);

test('decodes a captured H5122 press and preserves its event id', () => {
  const [payload] = manufacturerCandidates({ manufacturerData: CAPTURED_H5122_PACKET });
  const parsed = parseH512xAdvertisement({
    address: 'aa:bb:cc:dd:ee:ff',
    localName: 'Govee_H5122',
    rssi: -55,
    manufacturerData: payload,
  });

  assert.ok(parsed);
  assert.equal(parsed.sensor.model, 'H5122');
  assert.equal(parsed.sensor.address, 'aa:bb:cc:dd:ee:ff');
  assert.equal(parsed.event.id, '04f80f26');
  assert.equal(parsed.event.button, 0);
});

test('rejects a packet whose encrypted payload fails CRC validation', () => {
  const damaged = Buffer.from(CAPTURED_H5122_PACKET.subarray(2));
  damaged[10] ^= 0xff;
  assert.equal(
    parseH512xAdvertisement({
      address: 'aa:bb:cc:dd:ee:ff',
      manufacturerData: damaged,
    }),
    null,
  );
});
