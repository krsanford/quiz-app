const FALLBACK_NAMES = [
  'CleverOtter',
  'BrightPanda',
  'QuickFalcon',
  'MellowKoala',
  'BraveCoyote',
  'KindBadger',
  'CalmWren',
  'SunnyTurtle',
  'NeatLynx',
  'SwiftHeron',
  'GentleHawk',
  'CozyFinch',
];

const parseKahootName = async fetcher => {
  const res = await fetcher('https://apis.kahoot.it/namerator');
  if (!res.ok) throw new Error('Nickname API unavailable');
  const data = await res.json();
  if (Array.isArray(data?.name)) {
    return data.name.join(' ');
  }
  if (data?.name) return String(data.name);
  throw new Error('Invalid nickname payload');
};

const getNickname = async fetcher => {
  try {
    return await parseKahootName(fetcher);
  } catch (error) {
    const index = Math.floor(Math.random() * FALLBACK_NAMES.length);
    return FALLBACK_NAMES[index];
  }
};

module.exports = { getNickname };
