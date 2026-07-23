import {
  SAVE_MAGIC,
  SAVE_VERSION,
  type GameState,
  type SaveEnvelope,
} from "../state/types";

// A little header so the file reads as its own "datatype" rather than plain
// JSON. The body is base64 of the UTF-8 JSON envelope. We still accept plain
// JSON on load for portability / hand-editing.
const FILE_HEADER = "RPGTASK-SAVE/1";

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToUtf8(b64: string): string {
  const binary = atob(b64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeSave(state: GameState): string {
  const envelope: SaveEnvelope = {
    magic: SAVE_MAGIC,
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    state,
  };
  const json = JSON.stringify(envelope);
  return `${FILE_HEADER}\n${utf8ToBase64(json)}\n`;
}

export interface DecodedSave {
  state: GameState;
  savedAt: string;
  version: number;
}

export function decodeSave(raw: string): DecodedSave {
  const text = raw.trim();
  let jsonText: string;

  if (text.startsWith(FILE_HEADER)) {
    const body = text.slice(FILE_HEADER.length).trim();
    jsonText = base64ToUtf8(body);
  } else if (text.startsWith("{")) {
    // plain JSON fallback (either a bare envelope or a bare GameState)
    jsonText = text;
  } else {
    // last resort: try treating the whole thing as base64
    jsonText = base64ToUtf8(text);
  }

  const parsed = JSON.parse(jsonText);
  if (parsed && parsed.magic === SAVE_MAGIC && parsed.state) {
    const env = parsed as SaveEnvelope;
    return { state: env.state, savedAt: env.savedAt, version: env.version };
  }
  if (parsed && parsed.character && parsed.tasks) {
    // bare GameState
    return {
      state: parsed as GameState,
      savedAt: new Date().toISOString(),
      version: 0,
    };
  }
  throw new Error("This does not look like a Marathon save file.");
}
