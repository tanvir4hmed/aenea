import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationKey, readConversation, writeConversation, clearConversations, finalTranscriptOnce } from '../apps/web/src/alexaConversation.js';
import { signalDetails } from '../apps/web/src/liveAssistance.js';

function storage() {
  const values = new Map();
  return { get length() { return values.size; }, key: index => [...values.keys()][index],
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('conversation survives reload, is bounded, and remains household/incident scoped', () => {
  const saved = storage(), key = conversationKey('alice', 'one');
  const messages = Array.from({ length: 25 }, (_, index) => ({ phrase: `Question ${index}`, reply: 'A recorded answer', at: 1000, source: 'voice' }));
  assert.equal(writeConversation(saved, key, messages, 1000), true);
  assert.equal(readConversation(saved, key, 1001).length, 20);
  assert.equal(readConversation(saved, key, 1001)[0].phrase, 'Question 5');
  assert.deepEqual(readConversation(saved, conversationKey('bob', 'one'), 1001), []);
  assert.deepEqual(readConversation(saved, conversationKey('alice', 'two'), 1001), []);
  writeConversation(saved, conversationKey('bob', 'one'), messages, 1000);
  clearConversations(saved, 'alice');
  assert.equal(readConversation(saved, key, 1001).length, 0);
  assert.equal(readConversation(saved, conversationKey('bob', 'one'), 1001).length, 20);
  clearConversations(saved);
  assert.equal(saved.length, 0);
});

test('expired or unavailable conversation storage does not prevent asking questions', () => {
  const saved = storage(), key = conversationKey('alice', 'one');
  writeConversation(saved, key, [{ phrase: 'Who?', reply: 'Unknown.', at: 1 }], 1);
  assert.deepEqual(readConversation(saved, key, 8 * 86400000), []);
  const unavailable = { getItem() { throw new Error('Unavailable'); }, setItem() { throw new Error('Full'); } };
  assert.deepEqual(readConversation(unavailable, key), []);
  assert.equal(writeConversation(unavailable, key, []), false);
});

test('microphone sends one final transcript and ignores cancelled/old incident results', () => {
  let current = true;
  const sent = [], handle = finalTranscriptOnce(() => current, value => sent.push(value));
  const event = (text, isFinal) => ({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal })] });
  handle(event('is anybody', false));
  assert.equal(sent.length, 0);
  handle(event('is anybody home', true)); handle(event('is anybody home', true));
  assert.deepEqual(sent, ['is anybody home']);
  const stale = finalTranscriptOnce(() => current, value => sent.push(value));
  current = false; stale(event('new question', true));
  assert.equal(sent.length, 1);
});

test('legacy signal uses current name without inventing historical location', () => {
  const id = 'b36e6c19-5260-4392-a90c-787d2b1a2f0e';
  const catalog = { devices: [{ id, name: 'Hall camera', room: 'Hall', location_id: 'home' }], locations: [{ id: 'home', name: 'Home' }] };
  const detail = signalDetails({ device_id: id, name: id, kind: 'motion' }, catalog);
  assert.equal(detail.name, 'Hall camera');
  assert.equal(detail.place, 'Location not recorded in this report');
  assert.equal(detail.currentName, true);
  assert.equal(detail.missingContext, true);
  const missing = signalDetails({ device_id: id, name: id, kind: 'motion' }, { devices: [] });
  assert.equal(missing.name, 'Motion sensor');
});

test('recorded signal location and name remain stable after catalog edits', () => {
  const detail = signalDetails({ device_id: 'one', name: 'Kitchen detector', room: 'Kitchen', location_name: 'Original home', kind: 'smoke' },
    { devices: [{ id: 'one', name: 'Renamed detector', room: 'Basement' }] });
  assert.equal(detail.name, 'Kitchen detector');
  assert.equal(detail.place, 'Kitchen · Original home');
  assert.equal(detail.currentName, false);
});
