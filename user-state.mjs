export const MAX_STATE_BYTES = 200_000;

const fields = {
  read: 'array', quiz: 'object', quizAnswers: 'object', selectedLesson: 'string',
  notes: 'array', chat: 'array', sop: 'nullable-object', eod: 'object',
  checkpoint: 'nullable-object', lastPlace: 'nullable-object', lastVisit: 'nullable-string'
};

export function serializeUserState(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Invalid user state.');
  const state = {};
  for (const [key, kind] of Object.entries(fields)) {
    const item = value[key];
    if (item === undefined) continue;
    if (kind === 'array' && !Array.isArray(item)) throw new Error('Invalid user state.');
    if (kind === 'object' && (!item || Array.isArray(item) || typeof item !== 'object')) throw new Error('Invalid user state.');
    if (kind === 'nullable-object' && item !== null && (Array.isArray(item) || typeof item !== 'object')) throw new Error('Invalid user state.');
    if (kind === 'string' && typeof item !== 'string') throw new Error('Invalid user state.');
    if (kind === 'nullable-string' && item !== null && typeof item !== 'string') throw new Error('Invalid user state.');
    state[key] = item;
  }
  const json = JSON.stringify(state);
  if (new TextEncoder().encode(json).byteLength > MAX_STATE_BYTES) throw new Error('User state is too large.');
  return json;
}
