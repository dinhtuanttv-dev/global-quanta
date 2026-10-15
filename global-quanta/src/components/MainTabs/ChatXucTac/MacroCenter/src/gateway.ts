/** gateway.ts — điểm vào đóng gói cho Gateway (Node thuần). Tạo lại: npm run bundle:macro (-> backend/src/market/macro/vendor/macroEngine.mjs). */
export { createMacroApi } from './macro-api';
export { makeSyntheticStore, SYNTHETIC_NOTICE } from './macro-seed';
export { InMemoryVintageStore, VN_CATALOG, catalogById, checkQuality, importSeriesCsv, normalizePeriod } from './macro-data';
export { createMacroChatTools, MACRO_TOOL_SPECS, MACRO_CHAT_SYSTEM_PROMPT, toAnthropicTools, validateArgs } from './macro-chat-tools';
