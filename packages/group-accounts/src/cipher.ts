import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/**
 * AES-256-GCM for the group passwords in group_credential. Keys come from
 * GROUP_CREDENTIAL_KEY_1 and GROUP_CREDENTIAL_KEY_2 (32 random bytes each,
 * kept apart from AUTH_SECRET and offline as well). Each row stores the
 * fingerprint of the key that encrypted it (`key_id`), never a slot number,
 * so a key can move between slots without confusing the rows.
 *
 * Rotation: put the new key in slot 2 and deploy. New and rewritten secrets
 * use slot 2 from then on, and every row still on the old key is
 * re-encrypted the next time the worker reads it; `backfill-group-accounts
 * --resync` reads them all. Once `select key_id, count(*) from
 * group_credential group by 1` shows a single key id, move the new key to
 * slot 1 and unset slot 2.
 *
 * The additional data binds each ciphertext to its group and column, so a
 * value copied into another row or column does not decrypt.
 */

/** Thrown when a stored secret cannot be decrypted; never carries the value. */
export class CredentialDecryptError extends Error {
  override readonly name = "CredentialDecryptError";
}

const FORMAT = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** The id stored in key_id: a fingerprint of the key, not the key. */
export function credentialKeyId(key: Buffer): string {
  return `k${createHash("sha256")
    .update("laundryroom group credential key\0")
    .update(key)
    .digest("hex")
    .slice(0, 16)}`;
}

export class CredentialCipher {
  private readonly keys = new Map<string, Buffer>();
  /** the key new secrets are encrypted with: slot 2 if set, else slot 1 */
  readonly currentKeyId: string;

  constructor(slots: { 1?: Buffer; 2?: Buffer }) {
    for (const key of [slots[1], slots[2]]) {
      if (!key) continue;
      if (key.length !== 32) {
        throw new Error("a group credential key must be 32 bytes");
      }
      this.keys.set(credentialKeyId(key), key);
    }
    const current = slots[2] ?? slots[1];
    if (!current) throw new Error("no group credential key configured");
    this.currentKeyId = credentialKeyId(current);
  }

  /** Whether a row encrypted with `keyId` can be read. */
  hasKey(keyId: string): boolean {
    return this.keys.has(keyId);
  }

  /** Encrypts with the current key. `context` names the row and column. */
  encrypt(plaintext: string, context: string): string {
    const key = this.keys.get(this.currentKeyId);
    if (!key) throw new Error("the current credential key is missing");
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(context, "utf8"));
    const body = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    return `${FORMAT}.${iv.toString("base64url")}.${body.toString("base64url")}`;
  }

  /**
   * Decrypts a value written by `encrypt` with the key `keyId`, under the
   * same `context`. Throws a CredentialDecryptError (without the value) when
   * the key is not configured or the value was tampered with or moved.
   */
  decrypt(sealed: string, keyId: string, context: string): string {
    const key = this.keys.get(keyId);
    if (!key) {
      throw new CredentialDecryptError(
        `the credential key ${keyId} is not configured (GROUP_CREDENTIAL_KEY_1/_2)`,
      );
    }
    const [format, ivPart, bodyPart, extra] = sealed.split(".");
    if (format !== FORMAT || !ivPart || !bodyPart || extra !== undefined) {
      throw new CredentialDecryptError(
        `unknown credential format (${context})`,
      );
    }
    const iv = Buffer.from(ivPart, "base64url");
    const body = Buffer.from(bodyPart, "base64url");
    if (iv.length !== IV_BYTES || body.length < TAG_BYTES) {
      throw new CredentialDecryptError(`malformed credential (${context})`);
    }
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAAD(Buffer.from(context, "utf8"));
      decipher.setAuthTag(body.subarray(body.length - TAG_BYTES));
      return Buffer.concat([
        decipher.update(body.subarray(0, body.length - TAG_BYTES)),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new CredentialDecryptError(
        `a stored credential does not decrypt (${context})`,
      );
    }
  }
}

/** A fresh account password: 32 random bytes, base64url (43 characters). */
export function randomPassword(): string {
  return randomBytes(32).toString("base64url");
}
