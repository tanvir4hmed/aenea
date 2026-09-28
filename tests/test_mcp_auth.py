"""Real signed JWT checks without a live issuer or AWS credentials."""

import sys
import time
import unittest
from pathlib import Path

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services/mcp"))
from token_auth import verify_token


class TokenTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    def setUp(self):
        self.claims = {
            "iss": "https://issuer.example",
            "sub": "owner",
            "client_id": "client",
            "token_use": "access",
            "aud": "https://api.example/mcp",
            "exp": int(time.time()) + 600,
            "iat": int(time.time()),
            "scope": "aenea/read",
        }

    def verify(self, tool="get_incident_status"):
        return verify_token(
            jwt.encode(self.claims, self.key, algorithm="RS256"),
            self.key.public_key(),
            "https://issuer.example",
            "client",
            "https://api.example/mcp",
            tool,
        )

    def test_bound_access_token_is_accepted(self):
        self.assertEqual(self.verify()["sub"], "owner")

    def test_wrong_or_missing_audience_issuer_client_type_and_expiry_rejected(self):
        for field, value in (
            ("aud", "https://other.example/mcp"),
            ("iss", "https://other.example"),
            ("client_id", "other"),
            ("token_use", "id"),
            ("exp", 1),
        ):
            with self.subTest(field=field):
                original = self.claims[field]
                self.claims[field] = value
                with self.assertRaises((jwt.InvalidTokenError, ValueError)):
                    self.verify()
                self.claims[field] = original
        self.claims.pop("aud")
        with self.assertRaises(jwt.MissingRequiredClaimError):
            self.verify()

    def test_read_only_token_cannot_write(self):
        with self.assertRaisesRegex(ValueError, "scope"):
            self.verify("confirm_action")
        self.claims["scope"] = "aenea/read aenea/write"
        self.assertEqual(self.verify("confirm_action")["sub"], "owner")

    def test_bad_signature_is_rejected(self):
        other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        with self.assertRaises(jwt.InvalidSignatureError):
            verify_token(
                jwt.encode(self.claims, other, algorithm="RS256"),
                self.key.public_key(),
                self.claims["iss"],
                "client",
                self.claims["aud"],
                "get_incident_status",
            )
