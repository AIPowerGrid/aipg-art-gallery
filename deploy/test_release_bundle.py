# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 AI Power Grid
"""Archive negative controls use only disposable local diagnostic bytes."""

import copy
import hashlib
import io
import json
import os
import shutil
import subprocess
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from release_bundle import (
    SCHEMA,
    encrypt_archive,
    extract_verified,
    public_env,
    read_json,
    verify_archive,
)

COMMIT = "1" * 40
PROFILE = {
    "NEXT_PUBLIC_GOOGLE_CLIENT_ID": "123-example.apps.googleusercontent.com",
    "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID": "0" * 32,
    "NEXT_PUBLIC_GALLERY_API": "/api",
    "NEXT_PUBLIC_DEFAULT_CHAIN_ID": "8453",
}


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.archive = self.root / "release.tar.gz"
        names = (
            "gallery-server",
            "package.json",
            "package-lock.json",
            "next.config.mjs",
            ".next/BUILD_ID",
            "node_modules/next/package.json",
            "node_modules/next/bin/next",
            "sbom/frontend.cdx.json",
            "sbom/backend.cdx.json",
        )
        self.data = {name: b"diagnostic fixture" for name in names}
        self.manifest = {
            "schema": SCHEMA,
            "commit": COMMIT,
            "tree": "2" * 40,
            "platform": "linux-x64",
            "runtime": {"node": "22.23.2", "go": "go1.26.9"},
            "public_env": PROFILE,
            "source": {
                "package.json": hashlib.sha256(self.data["package.json"]).hexdigest()
            },
            "files": {
                n: {
                    "kind": "file",
                    "mode": 0o644,
                    "size": len(b),
                    "sha256": hashlib.sha256(b).hexdigest(),
                }
                for n, b in self.data.items()
            },
        }
        self.manifest["files"]["node_modules/.bin/next"] = {
            "kind": "symlink",
            "mode": 0o777,
            "target": "../next/bin/next",
        }

    def tearDown(self):
        self.temporary.cleanup()

    def write(self, change=None, extra=None, duplicate=False):
        manifest = copy.deepcopy(self.manifest)
        if change:
            change(manifest)
        with tarfile.open(self.archive, "w:gz") as tar:
            for name, entry in manifest["files"].items():
                member = tarfile.TarInfo("gallery-" + COMMIT + "/" + name)
                member.mode = entry["mode"]
                if entry["kind"] == "symlink":
                    member.type = tarfile.SYMTYPE
                    member.linkname = entry["target"]
                    tar.addfile(member)
                else:
                    body = self.data.get(name, b"fixture")
                    member.size = len(body)
                    tar.addfile(member, io.BytesIO(body))
            encoded = json.dumps(manifest).encode()
            member = tarfile.TarInfo("gallery-" + COMMIT + "/release-manifest.json")
            member.mode = 0o644
            member.size = len(encoded)
            tar.addfile(member, io.BytesIO(encoded))
            if duplicate:
                tar.addfile(member, io.BytesIO(encoded))
            if extra:
                tar.addfile(extra, io.BytesIO(b"x") if extra.isfile() else None)

    def test_valid_bundle_and_safe_npm_symlink_extract(self):
        self.write()
        destination = self.root / ".building-fixture"
        result = extract_verified(self.archive, destination, COMMIT)
        self.assertEqual(result["commit"], COMMIT)
        self.assertEqual(
            (destination / "node_modules/.bin/next").read_bytes(), b"diagnostic fixture"
        )

    def test_duplicate_manifest(self):
        self.write(duplicate=True)
        with self.assertRaises(ValueError):
            verify_archive(self.archive, COMMIT)

    def test_duplicate_json_keys(self):
        with self.assertRaises(ValueError):
            read_json(b'{"schema":1,"schema":2}')

    def test_changed_source_and_toolchain(self):
        for field, value in (
            ("commit", "3" * 40),
            ("platform", "linux-arm64"),
            ("runtime", {"node": "20.0.0", "go": "go1.26.9"}),
        ):
            with self.subTest(field=field):
                self.write(lambda m, field=field, value=value: m.update({field: value}))
                with self.assertRaises(ValueError):
                    verify_archive(self.archive, COMMIT)

    def test_changed_hash_size_mode_and_source_commitment(self):
        changes = [
            lambda m: m["files"]["gallery-server"].update(sha256="0" * 64),
            lambda m: m["files"]["gallery-server"].update(size=999),
            lambda m: m["files"]["gallery-server"].update(mode=0o664),
            lambda m: m["source"].update({"package.json": "0" * 64}),
        ]
        for change in changes:
            with self.subTest(change=changes.index(change)):
                self.write(change)
                with self.assertRaises(ValueError):
                    verify_archive(self.archive, COMMIT)

    def test_missing_runtime_member(self):
        self.write(lambda m: m["files"].pop("gallery-server"))
        with self.assertRaises(ValueError):
            verify_archive(self.archive, COMMIT)

    def test_traversal_duplicate_and_uncommitted_members(self):
        for name in (
            "../outside",
            "gallery-" + COMMIT + "/../outside",
            "gallery-" + COMMIT + "/uncommitted",
            "gallery-" + COMMIT + "/gallery-server",
            "gallery-" + COMMIT + "/.env",
        ):
            with self.subTest(name=name):
                member = tarfile.TarInfo(name)
                member.size = 1
                self.write(extra=member)
                with self.assertRaises(ValueError):
                    verify_archive(self.archive, COMMIT)

    def test_hardlinks_and_devices(self):
        for kind in (tarfile.LNKTYPE, tarfile.FIFOTYPE, tarfile.CHRTYPE):
            with self.subTest(kind=kind):
                member = tarfile.TarInfo("gallery-" + COMMIT + "/bad")
                member.type = kind
                self.write(extra=member)
                with self.assertRaises(ValueError):
                    verify_archive(self.archive, COMMIT)

    def test_symlink_escape_and_ancestor(self):
        for target in ("/etc/passwd", "../../../outside", "../missing"):
            with self.subTest(target=target):
                self.write(
                    lambda m, target=target: m["files"][
                        "node_modules/.bin/next"
                    ].update(target=target)
                )
                with self.assertRaises(ValueError):
                    verify_archive(self.archive, COMMIT)
        self.write(
            lambda m: m["files"].update(
                {"node_modules/.bin/next/child": dict(m["files"]["package.json"])}
            )
        )
        with self.assertRaises(ValueError):
            verify_archive(self.archive, COMMIT)

    def test_verify_before_writing_or_overwriting(self):
        self.write(lambda m: m["files"]["gallery-server"].update(sha256="0" * 64))
        destination = self.root / ".building-bad"
        with self.assertRaises(ValueError):
            extract_verified(self.archive, destination, COMMIT)
        self.assertFalse(destination.exists())
        self.write()
        destination.mkdir()
        with self.assertRaises(ValueError):
            extract_verified(self.archive, destination, COMMIT)

    def test_preserve_disk_headroom(self):
        self.write()
        destination = self.root / ".building-full"
        with (
            patch(
                "release_bundle.shutil.disk_usage",
                return_value=shutil._ntuple_diskusage(1000, 999, 1),
            ),
            self.assertRaises(ValueError),
        ):
            extract_verified(self.archive, destination, COMMIT)
        self.assertFalse(destination.exists())

    def test_archive_symlink_rejected(self):
        self.write()
        link = self.root / "alias.tar.gz"
        link.symlink_to(self.archive)
        with self.assertRaises(ValueError):
            verify_archive(link, COMMIT)

    def test_public_profile_never_accepts_secret_or_absolute_origin(self):
        self.assertEqual(public_env(PROFILE), PROFILE)
        for field, value in (
            ("AIPG_API_KEY", "diagnostic"),
            ("NEXT_PUBLIC_GALLERY_API", "https://example.com/api"),
            ("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "private-value"),
            ("NEXT_PUBLIC_DEFAULT_CHAIN_ID", "1"),
        ):
            with self.subTest(field=field), self.assertRaises(ValueError):
                public_env({**PROFILE, field: value})

    @unittest.skipUnless(
        shutil.which("openssl") and os.environ.get("GALLERY_CMS_TEST") == "1",
        "Linux OpenSSL3 cipher control runs in CI",
    )
    def test_actual_cms_authenticated_encryption_and_tamper_rejection(self):
        key = self.root / "test-key.pem"
        cert = self.root / "test-cert.pem"
        subprocess.run(
            [
                "openssl",
                "req",
                "-new",
                "-x509",
                "-newkey",
                "rsa:3072",
                "-nodes",
                "-days",
                "1",
                "-subj",
                "/CN=Disposable Gallery test",
                "-keyout",
                str(key),
                "-out",
                str(cert),
            ],
            check=True,
            capture_output=True,
        )
        plain = self.root / "test.dat"
        plain.write_bytes(b"private diagnostic bytes")
        encrypted = self.root / "test.cms"
        recovered = self.root / "recovered.dat"
        encrypt_archive(plain, encrypted, cert)
        command = [
            "openssl",
            "cms",
            "-decrypt",
            "-binary",
            "-inform",
            "DER",
            "-in",
            str(encrypted),
            "-recip",
            str(cert),
            "-inkey",
            str(key),
            "-out",
            str(recovered),
        ]
        subprocess.run(command, check=True, capture_output=True)
        self.assertEqual(recovered.read_bytes(), plain.read_bytes())
        ciphertext = bytearray(encrypted.read_bytes())
        ciphertext[-1] ^= 1
        encrypted.write_bytes(ciphertext)
        self.assertNotEqual(
            subprocess.run(command, check=False, capture_output=True).returncode, 0
        )


if __name__ == "__main__":
    unittest.main()
