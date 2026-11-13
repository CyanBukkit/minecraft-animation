/** 把 Minecraft 方块名收成彩贝方映现有的十几种表面。认不出的实心方块先当成石头。 */

const EXACT = {
  grass_block: 'grass',
  podzol: 'dirt',
  mycelium: 'grass',
  dirt: 'dirt',
  coarse_dirt: 'dirt',
  rooted_dirt: 'dirt',
  mud: 'dirt',
  packed_mud: 'dirt',
  farmland: 'dirt',
  dirt_path: 'path',
  grass_path: 'path',
  stone: 'stone',
  cobblestone: 'stone',
  mossy_cobblestone: 'stone',
  stone_bricks: 'stone',
  mossy_stone_bricks: 'stone',
  cracked_stone_bricks: 'stone',
  smooth_stone: 'stone',
  andesite: 'stone',
  diorite: 'stone',
  granite: 'stone',
  deepslate: 'stone',
  cobbled_deepslate: 'stone',
  tuff: 'stone',
  calcite: 'stone',
  dripstone_block: 'stone',
  bedrock: 'stone',
  obsidian: 'stone',
  crying_obsidian: 'stone',
  netherrack: 'stone',
  basalt: 'stone',
  blackstone: 'stone',
  end_stone: 'stone',
  sand: 'sand',
  red_sand: 'sand',
  sandstone: 'sand',
  red_sandstone: 'sand',
  gravel: 'stone',
  clay: 'stone',
  water: 'water',
  glass: 'glass',
  tinted_glass: 'glass',
  glowstone: 'glow',
  shroomlight: 'glow',
  sea_lantern: 'glow',
  ochre_froglight: 'glow',
  verdant_froglight: 'glow',
  pearlescent_froglight: 'glow',
  lantern: 'glow',
  soul_lantern: 'glow',
  bricks: 'roof',
  nether_bricks: 'roof',
  red_nether_bricks: 'roof',
  oak_planks: 'wood',
  oak_log: 'bark',
  oak_wood: 'bark',
  oak_leaves: 'leaf',
};

const NON_FULL = /(torch|sign|button|pressure_plate|sapling|rail|carpet|banner|candle|door|trapdoor|fence|slab|stairs|vine|ladder|flower|mushroom|coral|hanging|wire|repeater|comparator|lever|tripwire|string|frame|pot|skull|head|pane|bars|chain|rod|amethyst_cluster|scaffolding|powder_snow|fire|portal|kelp|seagrass|roots|sprouts|dripleaf|azalea|moss_carpet|lily_pad|cobweb)$/;
const DECOR_PREFIX = /^(?:waxed_|oxidized_|weathered_|exposed_|polished_|smooth_|chiseled_|cut_|cracked_|mossy_|infested_)/;

function known(kind, name) {
  return { kind, fallback: false, name };
}

/** 去掉 waxed / cut / polished 这类前缀，方便 quartz、copper 对上同一类。 */
function coreName(base) {
  let name = base;
  while (DECOR_PREFIX.test(name)) name = name.replace(DECOR_PREFIX, '');
  return name;
}

/** 大厅里常见的建筑方块。彩色混凝土、羊毛、陶瓦不要再掉进「不认识 → 石头」。 */
function familyKind(name) {
  if (name.endsWith('_concrete_powder') || name === 'concrete_powder') return 'sand';
  if (name.endsWith('_concrete') || name === 'concrete') return 'wood';
  if (name.endsWith('_wool') || name === 'wool') return 'wood';
  if (name.includes('terracotta')) return 'roof';
  if (name.includes('quartz')) return 'path';
  if (name.includes('purpur')) return 'roof';
  if (name.includes('prismarine')) return 'stone';
  if (name.startsWith('raw_') && name.endsWith('_block')) return 'stone';
  if (name.includes('copper')) return 'roof';
  if (name === 'iron_block') return 'stone';
  if (name === 'gold_block' || name === 'gilded_blackstone') return 'glow';
  if (name === 'emerald_block') return 'grass';
  if (name === 'diamond_block') return 'glass';
  if (name === 'lapis_block') return 'water';
  if (name === 'redstone_block') return 'roof';
  if (name === 'amethyst_block' || name === 'budding_amethyst') return 'glass';
  if (name === 'ice' || name === 'packed_ice' || name === 'blue_ice') return 'glass';
  if (name === 'snow_block') return 'path';
  if (name === 'honeycomb_block' || name === 'honey_block') return 'glow';
  if (name === 'slime_block') return 'grass';
  if (name === 'hay_block') return 'wood';
  if (name === 'bone_block') return 'path';
  if (name === 'netherite_block' || name === 'ancient_debris') return 'stone';
  if (name.endsWith('_bricks')) return name.includes('nether') || name.includes('mud') ? 'roof' : 'stone';
  if (name.endsWith('_tiles')) return 'stone';
  if (name.endsWith('_pillar')) {
    if (name.includes('quartz')) return 'path';
    if (name.includes('purpur')) return 'roof';
    return 'bark';
  }
  if (name.endsWith('_planks')) return 'wood';
  if (name.endsWith('_log') || name.endsWith('_wood') || name.endsWith('_hyphae') || name.endsWith('_stem')) return 'bark';
  if (name.endsWith('_leaves')) return 'leaf';
  if (name.endsWith('_sand')) return 'sand';
  if (name.endsWith('_glass')) return 'glass';
  if (name.endsWith('_ore') || name.includes('deepslate')) return 'stone';
  return null;
}

/**
 * @param {string} raw 例如 minecraft:grass_block 或 minecraft:oak_log[axis=y]
 * @returns {{ kind: string, fallback: boolean, name: string } | null} null 表示空气或不放进场景的小物件
 */
export function mapBlockName(raw) {
  const base = String(raw || '').toLowerCase().split('[')[0].replace(/^minecraft:/, '');
  if (!base || base === 'air' || base === 'cave_air' || base === 'void_air' || base === 'structure_void') return null;
  if (NON_FULL.test(base)) return null;
  const core = coreName(base);
  const exact = EXACT[base] || EXACT[core];
  if (exact) return known(exact, base);
  const family = familyKind(base) || familyKind(core);
  if (family) return known(family, base);
  return { kind: 'stone', fallback: true, name: base };
}

/** 1.12 及更早原理图里的数字编号。0 是空气。 */
const LEGACY_IDS = {
  1: 'stone',
  2: 'grass',
  3: 'dirt',
  4: 'stone',
  5: 'wood',
  7: 'stone',
  8: 'water',
  9: 'water',
  12: 'sand',
  13: 'stone',
  17: 'bark',
  18: 'leaf',
  20: 'glass',
  24: 'sand',
  35: 'wood',
  45: 'roof',
  48: 'stone',
  49: 'stone',
  79: 'glass',
  80: 'path',
  82: 'dirt',
  87: 'stone',
  89: 'glow',
  98: 'stone',
  112: 'roof',
  121: 'sand',
  155: 'stone',
  159: 'roof',
  162: 'bark',
  168: 'sand',
  172: 'dirt',
  179: 'sand',
};

export function mapLegacyBlockId(id) {
  if (id === 0) return null;
  const kind = LEGACY_IDS[id];
  if (kind) return { kind, fallback: false, name: `legacy:${id}` };
  return { kind: 'stone', fallback: true, name: `legacy:${id}` };
}
