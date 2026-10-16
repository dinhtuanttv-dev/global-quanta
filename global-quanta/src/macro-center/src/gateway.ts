/** gateway.ts — điểm vào đóng gói cho Gateway (Node thuần). Tạo lại: npm run bundle:macro (-> backend/src/market/macro/vendor/macroEngine.mjs). */
export { createMacroApi } from './macro-api';
export { makeSyntheticStore, SYNTHETIC_NOTICE } from './macro-seed';
export { InMemoryVintageStore, VN_CATALOG, catalogById, checkQuality, importSeriesCsv, normalizePeriod } from './macro-data';
export { createMacroChatTools, MACRO_TOOL_SPECS, MACRO_CHAT_SYSTEM_PROMPT, toAnthropicTools, validateArgs } from './macro-chat-tools';
// Kết nối thế giới (v1.2)
export { createWorldApi, WORLD_SCENARIOS } from './world-api';
export { makeSyntheticWorld, WORLD_SYNTHETIC_NOTICE, WORLD_CATALOG } from './world-seed';
export { validateWorldEvent, VN_SECTORS, WORLD_MARKETS, WORLD_FACTOR_IDS, WORLD_EXTRA_FACTORS, WORLD_FACTOR_INFO } from './world-types';
export { createWorldChatTools, WORLD_TOOL_SPECS, WORLD_CHAT_GUIDELINES } from './world-chat-tools';
