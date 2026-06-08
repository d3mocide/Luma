"""Print a fresh VAPID key pair to stdout. Does not modify any files."""
import base64

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

key = ec.generate_private_key(ec.SECP256R1())

priv_d = key.private_numbers().private_value.to_bytes(32, 'big')
priv_b64 = base64.urlsafe_b64encode(priv_d).rstrip(b'=').decode()

pub_raw = key.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
pub_b64 = base64.urlsafe_b64encode(pub_raw).rstrip(b'=').decode()

print("Add these to your .env:\n")
print(f"VAPID_PRIVATE_KEY={priv_b64}")
print(f"VAPID_PUBLIC_KEY={pub_b64}")
print("\nKeep VAPID_PRIVATE_KEY secret — it signs every push request.")
