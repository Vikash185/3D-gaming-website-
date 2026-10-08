// Content for the blood-contract spiral and the "way of the blade" section.

export const CATEGORIES = [
  { id: 'hunts', label: 'Hunts' },
  { id: 'duels', label: 'Duels' },
  { id: 'purges', label: 'Purges' },
  { id: 'escorts', label: 'Escorts' },
  { id: 'thefts', label: 'Thefts' },
];

// tint: the colour the frosted glass picks up from each painting
export const SERVICES = [
  {
    slug: 'crimson-eclipse', lines: ['Crimson', 'Eclipse'], category: 'hunts',
    client: 'Governor of Kamakura', reward: '3,600 koku', danger: 4,
    keywords: 'traitor general eclipse moon red city fire burning rooftop helm',
    text: 'A traitor general crowned himself beneath the eclipse while his city burned. Bring back his helm and leave the rest to the crows.',
    tint: [0.9, 0.16, 0.1],
  },
  {
    slug: 'nine-tails', lines: ['Nine', 'Tails'], category: 'purges',
    client: 'Priestesses of the Fox Shrine', reward: 'Foxfire charms', danger: 3,
    keywords: 'fox spirit nine tails vixen priestess possession gates shrine',
    text: 'A nine-tailed vixen wears the head priestess like a mask. Climb the thousand gates before sunrise and drive it out without spilling her blood.',
    tint: [0.25, 0.55, 1],
  },
  {
    slug: 'higanbana-duel', lines: ['Higanbana', 'Duel'], category: 'duels',
    client: 'The Dueling Circle', reward: 'Title: Lily Blade', danger: 4,
    keywords: 'duel grudge lily lilies flowers sunset dusk samurai armour honour',
    text: 'An old grudge ends where it began: two swords, one breath, a sea of red lilies at sundown.',
    tint: [1, 0.45, 0.12], video: true,
  },
  {
    slug: 'misty-road', lines: ['Misty', 'Road'], category: 'escorts',
    client: 'Kiyomori Trading House', reward: '2,200 koku', danger: 2,
    keywords: 'porters merchant fog bandits forest mountains escort road caravan',
    text: 'Guide a line of porters through mountains where the fog swallows travellers and the stone lanterns whisper.',
    tint: [0.45, 0.62, 0.6],
  },
  {
    slug: 'gilded-reliquary', lines: ['Gilded', 'Reliquary'], category: 'thefts',
    client: 'The Canal Brotherhood', reward: 'A cut of the gold', danger: 3,
    keywords: 'gold treasure temple monks statue theft steal coins curse',
    text: 'Empty a temple vault the abbots swear is cursed. Take the gold. Do not open the sealed boxes.',
    tint: [1, 0.68, 0.22],
  },
  {
    slug: 'petal-phantom', lines: ['Petal', 'Phantom'], category: 'duels',
    client: 'A widow of Nara', reward: "Her husband's sword", danger: 3,
    keywords: 'cherry blossom sakura ghost samurai grave revenge widow duel moon',
    text: 'Under the last blossoms of spring, a ghost swordsman waits to finish the fight that killed him.',
    tint: [1, 0.55, 0.8],
  },
  {
    slug: 'lantern-thief', lines: ['Lantern', 'Thief'], category: 'hunts',
    client: 'Merchants of Sakai', reward: '1,500 koku', danger: 2,
    keywords: 'thief mask market lanterns chase rooftops night',
    text: 'Every new moon a masked thief strips the lantern market bare. Run them down across the rooftops.',
    tint: [1, 0.58, 0.25],
  },
  {
    slug: 'storm-keep', lines: ['Storm', 'Keep'], category: 'thefts',
    client: 'An unsigned letter', reward: 'Unknown', danger: 5,
    keywords: 'storm rain lightning castle infiltrate stealth sneak blade keep',
    text: 'Climb into the warlord’s keep while the thunder covers your steps, and reclaim the sword he robbed from a grave.',
    tint: [0.4, 0.55, 0.95], video: true,
  },
  {
    slug: 'white-siege', lines: ['White', 'Siege'], category: 'duels',
    client: 'The Imperial Regent', reward: 'Pardon for one sin', danger: 5,
    keywords: 'snow winter blizzard general giant war siege army battle',
    text: 'Break a winter siege with one fight. Challenge the colossus who strides out of the blizzard.',
    tint: [0.75, 0.85, 1],
  },
  {
    slug: 'ferry-of-souls', lines: ['Ferry of', 'Souls'], category: 'escorts',
    client: 'The Boatman', reward: 'Passage, one day', danger: 3,
    keywords: 'boat river dead souls boatman lanterns water underworld',
    text: 'Protect a boat of the departed across the black water before the final lantern gutters out.',
    tint: [0.62, 0.4, 1],
  },
  {
    slug: 'scarlet-downpour', lines: ['Scarlet', 'Downpour'], category: 'hunts',
    client: 'Clan Hayabusa remnants', reward: '2,900 koku', danger: 4,
    keywords: 'rain ambush armour samurai slash night temple fight',
    text: 'Six armoured hunters wait at the temple steps in the rain. Let the storm decide who walks away.',
    tint: [0.85, 0.2, 0.25],
  },
  {
    slug: 'infernal-bargain', lines: ['Infernal', 'Bargain'], category: 'purges',
    client: 'Abbots of the Ash Temple', reward: 'A holy relic', danger: 5,
    keywords: 'fire hell demon pact burning city purge ritual',
    text: 'A burning demon has bought an entire domain. Shatter the bargain before the last temple bell melts.',
    tint: [1, 0.3, 0.08],
  },
  {
    slug: 'carvers-secret', lines: ["Carver's", 'Secret'], category: 'thefts',
    client: 'A faceless collector', reward: 'One unbound mask', danger: 3,
    keywords: 'mask maker carver candles workshop steal demon mask artisan',
    text: 'The old carver keeps one mask he will never sell. Lift it from his candlelit workshop without waking what sleeps inside.',
    tint: [1, 0.62, 0.35],
  },
  {
    slug: 'underworld-gate', lines: ['Underworld', 'Gate'], category: 'hunts',
    client: 'The Judge of the Dead', reward: 'Your soul, returned', danger: 5,
    keywords: 'co-op coop multiplayer raid friends underworld hell fire gate demon boss',
    text: 'A three-blade raid on the realm of the dead. Hunt the demon lord who guards the burning gate.',
    tint: [1, 0.36, 0.1], video: true, coop: true,
  },
];

export const pad2 = (i) => String(i + 1).padStart(2, '0');
export const mediaName = (i) => `${pad2(i)}-${SERVICES[i].slug}`;
export const titleOf = (s) => s.lines.join(' ');
export const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

// Spiral layout shared by the WebGL scene and the scroll mapping
export const SPIRAL = { radius: 1.5, drop: 0.55, step: (60 * Math.PI) / 180, front: (-9 * Math.PI) / 180 };
export const FOCUS_RANGE = [-2.4, SERVICES.length + 0.9];
export const focusFromProgress = (p) => FOCUS_RANGE[0] + (FOCUS_RANGE[1] - FOCUS_RANGE[0]) * p;
export const progressFromFocus = (f) => (f - FOCUS_RANGE[0]) / (FOCUS_RANGE[1] - FOCUS_RANGE[0]);

export const FEATURES = [
  {
    text: 'Ninety-six demon masks, each one a contract with something hungry. Wear one to reshape your fighting style, then settle the debt in blood, memory or years of your life.',
    tags: ['96 masks', 'Living curses', 'Every gift has a cost'],
  },
  {
    text: 'Switch between Stone, Gale, Ember and Hollow stances mid-combo: absorb a blow, vanish through a gap, shatter a guard, or cut before your blade leaves the scabbard.',
    tags: ['4 stances', 'Quick-draw strikes', 'Free-flow combat'],
  },
  {
    text: 'Let the mask drink your fury, then let go: red flame, hellish combos, and a hunger that no longer cares who stands beside you.',
    tags: ['Fury meter', 'Demon form', 'High risk, high reward'],
  },
  {
    text: 'Fox spirits, skeleton giants, spider brides and fifty more creatures from old legends, each with its own rules, its own weakness and its own memory of you.',
    tags: ['55 yokai', 'Evolving bestiary', 'Legendary hunts'],
  },
  {
    text: 'Gather three blades, descend into the underworld and storm the burning gate in drop-in co-op hunts that reshuffle every full moon.',
    tags: ['3-player co-op', 'Cross-play', 'Lunar events'],
  },
];

export const TRAILER = [
  { src: 'media/services/14-underworld-gate.mp4', caption: 'Underworld Gate — co-op hunt' },
  { src: 'media/services/03-higanbana-duel.mp4', caption: 'Higanbana Duel — field of red lilies' },
  { src: 'media/services/08-storm-keep.mp4', caption: 'Storm Keep — the thunder fortress' },
];

// "The domains" slider
export const DOMAINS = [
  { name: 'Akaboshi Peaks', img: '01-crimson-eclipse', tag: 'Fire', lord: 'The Eclipse Warlord', text: 'A castle town that never stopped burning, ruled from its rooftops by a crowned traitor.' },
  { name: 'Kitsunebi Woods', img: '02-nine-tails', tag: 'Spirit', lord: 'The Nine-Tailed Vixen', text: 'Blue foxfire leads travellers in circles until the shrine bells forget their names.' },
  { name: 'Higan Plains', img: '03-higanbana-duel', tag: 'Blood', lord: 'The Lily General', text: 'Endless red flowers grow wherever a duel was lost. The fields are very, very red.' },
  { name: 'Kiri Pass', img: '04-misty-road', tag: 'Fog', lord: 'The Hollow Porters', text: 'A mountain road where the mist walks beside you and the lanterns count your steps.' },
  { name: 'Kinzan Temple', img: '05-gilded-reliquary', tag: 'Gold', lord: 'The Gilded Abbot', text: 'Treasure piled to the ceiling, and every coin still remembers who it was taken from.' },
  { name: 'Yozakura Hill', img: '06-petal-phantom', tag: 'Ghost', lord: 'The Petal Swordsman', text: 'Cherry trees bloom only at midnight, over graves that refuse to stay quiet.' },
  { name: 'Raiu Fortress', img: '08-storm-keep', tag: 'Storm', lord: 'The Thunder Lord', text: 'A keep built inside a storm that has not stopped for forty years.' },
  { name: 'Hyōga Fields', img: '09-white-siege', tag: 'Ice', lord: 'The White Colossus', text: 'Frozen armies stand where they fell, waiting for a general who walks out of the snow.' },
  { name: 'Sanzu River', img: '10-ferry-of-souls', tag: 'Death', lord: 'The Boatman', text: 'Lantern boats carry the dead across black water. Not every passenger paid.' },
  { name: 'Jigoku Gate', img: '14-underworld-gate', tag: 'Hell', lord: 'The Judge of the Dead', text: 'The last road. A burning gate, and behind it, everything you ever cut down.' },
];
