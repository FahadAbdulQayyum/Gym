const RP_ID = '127.0.0.1';
const RP_NAME = 'Gym';

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

export async function isFingerprintAvailable() {
  if (!window.PublicKeyCredential) return false;
  if (
    typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function'
  ) {
    return false;
  }
  return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
}

export async function enrollFingerprint(student) {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = new TextEncoder().encode(student.id);

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: RP_NAME, id: RP_ID },
      user: {
        id: userId,
        name: student.name,
        displayName: student.name,
      },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'discouraged',
      },
      timeout: 60000,
      attestation: 'none',
    },
  });

  if (!credential) {
    throw new Error('Fingerprint enrollment was cancelled');
  }

  return bufferToBase64url(credential.rawId);
}

export async function verifyFingerprint(credentialIdBase64) {
  const challenge = crypto.getRandomValues(new Uint8Array(32));

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
      timeout: 60000,
    },
  });

  if (!assertion) {
    throw new Error('Fingerprint verification was cancelled');
  }

  return bufferToBase64url(assertion.rawId);
}

export async function verifyAnyEnrolledFingerprint(credentialIds) {
  if (credentialIds.length === 0) {
    throw new Error('No students have enrolled fingerprints yet');
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: RP_ID,
      allowCredentials: credentialIds.map((id) => ({
        id: base64urlToBuffer(id),
        type: 'public-key',
      })),
      userVerification: 'required',
      timeout: 60000,
    },
  });

  if (!assertion) {
    throw new Error('Fingerprint scan was cancelled');
  }

  return bufferToBase64url(assertion.rawId);
}
