const RP_ID = 'localhost';
const RP_NAME = 'Gym';

// Windows Hello requires both default algorithms (see Chromium pub_key_cred_params docs).
const PUB_KEY_CRED_PARAMS = [
  { alg: -7, type: 'public-key' },
  { alg: -257, type: 'public-key' },
];

function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBuffer(base64url) {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function mapWebAuthnError(error) {
  if (!error) return 'Fingerprint enrollment failed';
  if (error.name === 'NotAllowedError') {
    return 'Fingerprint enrollment was cancelled';
  }
  if (error.name === 'InvalidStateError') {
    return (
      'Windows would not create another passkey for this member. Remove their fingerprint in the ' +
      'attendance panel and try again, or delete old Gym passkeys under Settings → Accounts → Passkeys. ' +
      'Use a different finger than other members if Windows still blocks it.'
    );
  }
  if (error.message?.includes('passkey') || error.name === 'UnknownError') {
    return (
      'Windows could not save the passkey. Open Settings → Accounts → Passkeys, remove old Gym entries, ' +
      'confirm Windows Hello PIN and fingerprint are set up, then try again.'
    );
  }
  return error.message || 'Fingerprint enrollment failed';
}

export async function isFingerprintAvailable() {
  if (!window.PublicKeyCredential) return false;
  if (
    typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function'
  ) {
    return false;
  }
  return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
}

/**
 * @param {object} student
 * @param {{ excludeCredentialIds?: string[] }} [options]
 * @returns {Promise<{ credentialId: string, userHandle: string }>}
 */
export async function enrollFingerprint(student, options = {}) {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userHandle = crypto.getRandomValues(new Uint8Array(32));
  const excludeIds = options.excludeCredentialIds ?? [];

  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: RP_NAME, id: RP_ID },
        user: {
          id: userHandle,
          name: student.name,
          displayName: student.name,
        },
        pubKeyCredParams: PUB_KEY_CRED_PARAMS,
        excludeCredentials: excludeIds.map((id) => ({
          id: base64urlToBuffer(id),
          type: 'public-key',
        })),
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          // "preferred" lets Windows store multiple Gym passkeys (one per member).
          residentKey: 'preferred',
        },
        timeout: 120000,
        attestation: 'none',
      },
    });

    if (!credential) {
      throw new Error('Fingerprint enrollment was cancelled');
    }

    return {
      credentialId: bufferToBase64url(credential.rawId),
      userHandle: bufferToBase64url(userHandle),
    };
  } catch (error) {
    throw new Error(mapWebAuthnError(error));
  }
}

export async function verifyFingerprint(credentialIdBase64) {
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: RP_ID,
        allowCredentials: [
          {
            id: base64urlToBuffer(credentialIdBase64),
            type: 'public-key',
          },
        ],
        userVerification: 'required',
        timeout: 120000,
      },
    });

    if (!assertion) {
      throw new Error('Fingerprint verification was cancelled');
    }

    return bufferToBase64url(assertion.rawId);
  } catch (error) {
    if (error.name === 'NotAllowedError') {
      throw new Error('Fingerprint verification was cancelled');
    }
    throw error;
  }
}

export async function verifyAnyEnrolledFingerprint(credentialIds) {
  if (credentialIds.length === 0) {
    throw new Error('No students have enrolled fingerprints yet');
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: RP_ID,
        allowCredentials: credentialIds.map((id) => ({
          id: base64urlToBuffer(id),
          type: 'public-key',
        })),
        userVerification: 'required',
        timeout: 120000,
      },
    });

    if (!assertion) {
      throw new Error('Fingerprint scan was cancelled');
    }

    return bufferToBase64url(assertion.rawId);
  } catch (error) {
    if (error.name === 'NotAllowedError') {
      throw new Error('Fingerprint scan was cancelled');
    }
    throw error;
  }
}
