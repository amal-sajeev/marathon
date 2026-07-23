// Generates a VAPID key pair for Web Push and prints it as JSON.
// Usage: node scripts/gen-vapid.mjs
// Then: npx wrangler secret put VAPID_JSON  (paste the printed JSON)
import { webcrypto } from "node:crypto";
import { ApplicationServerKeys, setWebCrypto } from "webpush-webcrypto";

// Node doesn't expose the `self.crypto` global the library looks for, so give
// it Node's Web Crypto implementation explicitly.
setWebCrypto(webcrypto);

const keys = await ApplicationServerKeys.generate();
const json = await keys.toJSON();
console.log(JSON.stringify(json));
