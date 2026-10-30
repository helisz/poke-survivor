import { ENEMY_POOL, ELITE_POOL, BOSS_POOL, POKEMON_TYPE, POKEDEX_NAME } from './src/data/pokedex';
const all=[...ENEMY_POOL,...ELITE_POOL,...BOSS_POOL];
const m:Record<string,number>={};
for(const id of all){const t=POKEMON_TYPE[id]||'?';m[t]=(m[t]||0)+1;}
console.log('总数',all.length);
Object.entries(m).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(k,v));
console.log('--- 毒/虫/超能/飞行 明细 ---');
for(const id of all){const t=POKEMON_TYPE[id];if(['毒','虫','超能','飞行'].includes(t))console.log(id,POKEDEX_NAME[id],t);}
