# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 AI Power Grid
"""Build or verify a CI release; never select a release or restart services."""

import argparse
import hashlib
import io
import json
import os
import platform
import posixpath
import re
import shutil
import stat
import subprocess
import tarfile
import tempfile
from pathlib import Path, PurePosixPath

SCHEMA = "aipg.gallery-release.v1"
MAX_FILES = 100_000
MAX_FILE = 128 * 1024 * 1024
MAX_TOTAL = 2 * 1024 * 1024 * 1024
MAX_MANIFEST = 32 * 1024 * 1024
PUBLIC_FIELDS = {
    "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
    "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
    "NEXT_PUBLIC_GALLERY_API",
    "NEXT_PUBLIC_DEFAULT_CHAIN_ID",
    "NEXT_PUBLIC_MODELVAULT_CONTRACT_MAINNET",
    "NEXT_PUBLIC_MODELVAULT_CONTRACT_SEPOLIA",
}


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON field")
        result[key] = value
    return result


def read_json(data):
    if len(data) > MAX_MANIFEST:
        raise ValueError("Oversized JSON")
    return json.loads(data, object_pairs_hook=unique_object)


def public_env(value):
    if not isinstance(value, dict) or set(value) - PUBLIC_FIELDS:
        raise ValueError("Unexpected public build field")
    if any(not isinstance(v, str) or len(v) > 256 for v in value.values()):
        raise ValueError("Invalid public build value")
    if not re.fullmatch(
        r"[0-9]+-[A-Za-z0-9-]+\.apps\.googleusercontent\.com",
        value.get("NEXT_PUBLIC_GOOGLE_CLIENT_ID", ""),
    ):
        raise ValueError("Missing public Google client ID")
    if not re.fullmatch(
        r"[0-9a-fA-F]{32}", value.get("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID", "")
    ):
        raise ValueError("Missing public WalletConnect project ID")
    if (
        value.get("NEXT_PUBLIC_GALLERY_API") != "/api"
        or value.get("NEXT_PUBLIC_DEFAULT_CHAIN_ID") != "8453"
    ):
        raise ValueError("Unexpected origin or chain")
    for key in PUBLIC_FIELDS:
        if (
            "CONTRACT" in key
            and key in value
            and not re.fullmatch(r"0x[0-9a-fA-F]{40}", value[key])
        ):
            raise ValueError("Invalid public contract address")
    return value


def safe_name(name):
    if not isinstance(name, str) or not name or len(name) > 2048:
        raise ValueError("Invalid archive path")
    parts = PurePosixPath(name).parts
    if name.startswith("/") or any(p in (".", "..", ".git") for p in parts):
        raise ValueError("Archive traversal")
    if str(PurePosixPath(name)) != name or any(c in name for c in "\x00\r\n\\"):
        raise ValueError("Noncanonical archive path")
    if any(p.startswith(".env") and p != ".env.example" for p in parts):
        raise ValueError("Environment files cannot ship")
    return name


def link_target(name, target):
    if (
        not isinstance(target, str)
        or not target
        or target.startswith("/")
        or len(target) > 2048
    ):
        raise ValueError("Invalid release symlink")
    resolved = posixpath.normpath(posixpath.join(posixpath.dirname(name), target))
    safe_name(resolved)
    return resolved


def sha_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def run(args, cwd=None):
    return subprocess.check_output(args, cwd=cwd, text=True).strip()


def check_entries(entries):
    if not isinstance(entries, dict) or not 0 < len(entries) <= MAX_FILES:
        raise ValueError("Invalid release file count")
    total = 0
    for name, entry in entries.items():
        safe_name(name)
        if name == "release-manifest.json" or not isinstance(entry, dict):
            raise ValueError("Reserved or invalid manifest entry")
        if entry.get("kind") == "file":
            if set(entry) != {"kind", "mode", "size", "sha256"} or entry[
                "mode"
            ] not in (0o644, 0o755):
                raise ValueError("Invalid file metadata")
            if (
                type(entry["size"]) is not int
                or not 0 <= entry["size"] <= MAX_FILE
                or not re.fullmatch(r"[0-9a-f]{64}", entry["sha256"])
            ):
                raise ValueError("Invalid file commitment")
            total += entry["size"]
        elif entry.get("kind") == "symlink":
            if (
                set(entry) != {"kind", "mode", "target"}
                or entry["mode"] != 0o777
                or not name.startswith("node_modules/")
            ):
                raise ValueError("Invalid symlink metadata")
            target = link_target(name, entry["target"])
            if target not in entries and not any(
                n.startswith(target + "/") for n in entries
            ):
                raise ValueError("Dangling release symlink")
        else:
            raise ValueError("Unsupported release entry")
        for parent in PurePosixPath(name).parents:
            if str(parent) in entries:
                raise ValueError("Archive file or symlink is an ancestor")
    if total > MAX_TOTAL:
        raise ValueError("Release exceeds size limit")
    return total


def check_manifest(manifest, commit):
    if (
        not re.fullmatch(r"[0-9a-f]{40}", commit)
        or manifest.get("schema") != SCHEMA
        or manifest.get("commit") != commit
    ):
        raise ValueError("Release source mismatch")
    if manifest.get("platform") != "linux-x64" or not re.fullmatch(
        r"[0-9a-f]{40}", manifest.get("tree", "")
    ):
        raise ValueError("Invalid release platform or tree")
    public_env(manifest.get("public_env"))
    runtime = manifest.get("runtime", {})
    if (
        not re.fullmatch(r"22\.[0-9]+\.[0-9]+", runtime.get("node", ""))
        or runtime.get("go") != "go1.26.9"
    ):
        raise ValueError("Unreviewed release toolchain")
    entries = manifest.get("files")
    total = check_entries(entries)
    required = {
        "gallery-server",
        "package.json",
        "package-lock.json",
        "next.config.mjs",
        ".next/BUILD_ID",
        "node_modules/next/package.json",
        "sbom/frontend.cdx.json",
        "sbom/backend.cdx.json",
    }
    if not required <= set(entries) or any(
        entries[n]["kind"] != "file" for n in required
    ):
        raise ValueError("Incomplete runtime bundle")
    source = manifest.get("source", {})
    if (
        not isinstance(source, dict)
        or not source
        or any(
            n not in entries or entries[n]["sha256"] != digest
            for n, digest in source.items()
        )
    ):
        raise ValueError("Source files not bound to bundle")
    return total


def verify_archive(archive, commit):
    if (
        archive.is_symlink()
        or not archive.is_file()
        or archive.stat().st_size > MAX_TOTAL
    ):
        raise ValueError("Invalid release archive")
    prefix = "gallery-" + commit
    with tarfile.open(archive, "r:gz") as tar:
        members = {}
        for member in tar:
            if not member.name.startswith(prefix + "/"):
                raise ValueError("Unexpected archive root")
            name = safe_name(member.name[len(prefix) + 1 :])
            if (
                name in members
                or len(members) >= MAX_FILES + 1
                or not (member.isfile() or member.issym())
            ):
                raise ValueError("Duplicate or unsupported archive member")
            if member.size < 0 or member.size > (
                MAX_MANIFEST if name == "release-manifest.json" else MAX_FILE
            ):
                raise ValueError("Oversized archive member")
            members[name] = member
        record = members.get("release-manifest.json")
        if record is None or not record.isfile() or record.mode != 0o644:
            raise ValueError("Missing manifest")
        manifest = read_json(tar.extractfile(record).read())
        check_manifest(manifest, commit)
        if set(members) != set(manifest["files"]) | {"release-manifest.json"}:
            raise ValueError("Uncommitted or missing archive file")
        for name, entry in manifest["files"].items():
            member = members[name]
            if member.mode != entry["mode"]:
                raise ValueError("Archive mode mismatch")
            if entry["kind"] == "symlink":
                if (
                    not member.issym()
                    or member.linkname != entry["target"]
                    or member.size != 0
                ):
                    raise ValueError("Archive symlink mismatch")
            else:
                if not member.isfile() or member.size != entry["size"]:
                    raise ValueError("Archive byte-count mismatch")
                digest = hashlib.sha256()
                with tar.extractfile(member) as stream:
                    while chunk := stream.read(1024 * 1024):
                        digest.update(chunk)
                if digest.hexdigest() != entry["sha256"]:
                    raise ValueError("Archive file digest mismatch")
        return manifest


def extract_verified(archive, destination, commit):
    manifest = verify_archive(archive, commit)
    if (
        destination.exists()
        or destination.is_symlink()
        or not destination.parent.is_dir()
    ):
        raise ValueError("Extraction requires a fresh stage")
    needed = check_manifest(manifest, commit) + 1024 * 1024 * 1024
    if shutil.disk_usage(destination.parent).free < needed:
        raise ValueError("Insufficient space while preserving rollback")
    destination.mkdir(mode=0o755)
    prefix = "gallery-" + commit + "/"
    with tarfile.open(archive, "r:gz") as tar:
        for member in tar:
            name = member.name[len(prefix) :]
            if member.issym():
                continue
            target = destination / name
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            with target.open("xb") as output, tar.extractfile(member) as source:
                shutil.copyfileobj(source, output, 1024 * 1024)
            target.chmod(member.mode)
    for name, entry in manifest["files"].items():
        if entry["kind"] == "symlink":
            target = destination / name
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            target.symlink_to(entry["target"])
    for name, entry in manifest["files"].items():
        target = destination / name
        if entry["kind"] == "file":
            if (
                target.is_symlink()
                or target.stat().st_size != entry["size"]
                or sha_file(target) != entry["sha256"]
            ):
                raise ValueError("Extracted bytes changed; preserve incomplete stage")
        else:
            target.resolve(strict=True).relative_to(destination)
    return manifest


def encrypt_archive(archive, encrypted, cert):
    certificate = cert.read_text()
    if "PRIVATE KEY" in certificate or len(certificate) > 16384:
        raise ValueError("Expected only a public recipient certificate")
    public = subprocess.check_output(
        ["openssl", "x509", "-in", str(cert), "-pubkey", "-noout"]
    )
    details = subprocess.check_output(
        ["openssl", "pkey", "-pubin", "-text", "-noout"], input=public
    ).decode()
    bits = re.search(r"Public-Key: \(([0-9]+) bit\)", details)
    if not bits or int(bits[1]) < 3072 or encrypted.exists():
        raise ValueError("Invalid recipient or existing ciphertext")
    subprocess.run(
        [
            "openssl",
            "cms",
            "-encrypt",
            "-binary",
            "-aes-256-gcm",
            "-outform",
            "DER",
            "-in",
            str(archive),
            "-out",
            str(encrypted),
            "-recip",
            str(cert),
            "-keyopt",
            "rsa_padding_mode:oaep",
            "-keyopt",
            "rsa_oaep_md:sha256",
        ],
        check=True,
        capture_output=True,
    )
    der = subprocess.check_output(
        ["openssl", "x509", "-in", str(cert), "-outform", "DER"]
    )
    return hashlib.sha256(der).hexdigest()


def build_bundle(repo, output, server, frontend_bom, backend_bom, cert, commit):
    if (
        os.environ.get("GITHUB_ACTIONS") != "true"
        or platform.system() != "Linux"
        or platform.machine() != "x86_64"
    ):
        raise ValueError("Deployable bundles must build in Linux x64 CI")
    if run(["git", "rev-parse", "HEAD"], repo) != commit or run(
        ["git", "diff", "HEAD", "--name-only"], repo
    ):
        raise ValueError("Dirty or changed source checkout")
    if output.exists() or output.is_symlink():
        raise ValueError("Release output already exists")
    env = public_env(read_json(os.environ.get("GALLERY_PUBLIC_BUILD_ENV_JSON", "{}")))
    runtime = {
        "node": run(["node", "-p", "process.versions.node"]),
        "go": run(["go", "env", "GOVERSION"]),
    }
    if (repo / "node_modules/tailwindcss-animate").exists():
        raise ValueError("Build-only tooling remains in production install")
    for bom in (frontend_bom, backend_bom):
        value = read_json(bom.read_bytes())
        if (
            value.get("bomFormat") != "CycloneDX"
            or not value.get("metadata", {}).get("component")
            or not value.get("components")
        ):
            raise ValueError("Missing dependency inventory")
    files = {}
    inputs = {}
    source = {}

    def add(name, path, source_file=False):
        safe_name(name)
        if name in files:
            raise ValueError("Duplicate bundle input")
        metadata = path.lstat()
        if stat.S_ISLNK(metadata.st_mode):
            target = os.readlink(path)
            path.resolve(strict=True).relative_to(repo)
            files[name] = {"kind": "symlink", "mode": 0o777, "target": target}
        elif stat.S_ISREG(metadata.st_mode) and metadata.st_size <= MAX_FILE:
            digest = sha_file(path)
            files[name] = {
                "kind": "file",
                "mode": 0o755 if metadata.st_mode & 0o111 else 0o644,
                "size": metadata.st_size,
                "sha256": digest,
            }
            if source_file:
                source[name] = digest
        else:
            raise ValueError("Unsupported bundle input")
        inputs[name] = path

    tracked = (
        subprocess.check_output(["git", "ls-files", "-z"], cwd=repo)
        .decode()
        .split("\0")
    )
    for name in filter(None, tracked):
        if (repo / name).is_symlink():
            raise ValueError("Tracked source symlink is not supported")
        add(name, repo / name, True)
    for folder in (".next", "node_modules"):
        base = repo / folder
        if base.is_symlink() or not base.is_dir():
            raise ValueError("Missing built runtime")
        for directory, dirs, names in os.walk(base, followlinks=False):
            for name in list(dirs):
                path = Path(directory) / name
                relative = path.relative_to(repo).as_posix()
                if relative == ".next/cache":
                    dirs.remove(name)
                elif path.is_symlink():
                    add(relative, path)
                    dirs.remove(name)
            for name in names:
                path = Path(directory) / name
                add(path.relative_to(repo).as_posix(), path)
    for name, path in (
        ("gallery-server", server),
        ("sbom/frontend.cdx.json", frontend_bom),
        ("sbom/backend.cdx.json", backend_bom),
    ):
        if path.is_symlink():
            raise ValueError("Generated artifact symlink")
        add(name, path)
    manifest = {
        "schema": SCHEMA,
        "commit": commit,
        "tree": run(["git", "rev-parse", "HEAD^{tree}"], repo),
        "version": read_json((repo / "package.json").read_bytes())["version"],
        "platform": "linux-x64",
        "runtime": runtime,
        "public_env": env,
        "source": source,
        "files": files,
    }
    total = check_manifest(manifest, commit)
    output.mkdir(mode=0o700)
    with tempfile.TemporaryDirectory(prefix="gallery-release-") as temporary:
        temporary = Path(temporary)
        archive = temporary / "gallery.tar.gz"
        with tarfile.open(archive, "w:gz") as tar:
            for name in sorted(files):
                entry = files[name]
                member = tarfile.TarInfo("gallery-" + commit + "/" + name)
                member.mode = entry["mode"]
                if entry["kind"] == "symlink":
                    member.type = tarfile.SYMTYPE
                    member.linkname = entry["target"]
                    tar.addfile(member)
                else:
                    member.size = entry["size"]
                    with inputs[name].open("rb") as stream:
                        tar.addfile(member, stream)
            encoded = json.dumps(
                manifest, sort_keys=True, separators=(",", ":")
            ).encode()
            member = tarfile.TarInfo("gallery-" + commit + "/release-manifest.json")
            member.mode = 0o644
            member.size = len(encoded)
            tar.addfile(member, io.BytesIO(encoded))
        verify_archive(archive, commit)
        encrypted = output / "gallery-linux-x64.tar.gz.cms"
        fingerprint = encrypt_archive(archive, encrypted, cert)
        public_manifest = {
            "schema": SCHEMA + ".encrypted",
            "commit": commit,
            "tree": manifest["tree"],
            "version": manifest["version"],
            "platform": manifest["platform"],
            "runtime": runtime,
            "cipher": "openssl-cms-aes256gcm-rsa-oaep-sha256",
            "recipient_certificate_sha256": fingerprint,
            "archive_sha256": sha_file(archive),
            "archive_bytes": archive.stat().st_size,
            "unpacked_bytes": total,
            "files": len(files),
            "encrypted_sha256": sha_file(encrypted),
            "encrypted_bytes": encrypted.stat().st_size,
            "sbom": {
                "frontend": files["sbom/frontend.cdx.json"]["sha256"],
                "backend": files["sbom/backend.cdx.json"]["sha256"],
            },
        }
        (output / "release.json").write_text(
            json.dumps(public_manifest, indent=2) + "\n"
        )
        shutil.copyfile(frontend_bom, output / "frontend.cdx.json")
        shutil.copyfile(backend_bom, output / "backend.cdx.json")
    return public_manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("env", "build", "verify", "extract"))
    parser.add_argument("--commit")
    parser.add_argument("--archive", type=Path)
    parser.add_argument("--destination", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--server", type=Path)
    parser.add_argument("--frontend-bom", type=Path)
    parser.add_argument("--backend-bom", type=Path)
    parser.add_argument("--cert", type=Path)
    args = parser.parse_args()
    if args.mode == "env":
        values = public_env(
            read_json(os.environ.get("GALLERY_PUBLIC_BUILD_ENV_JSON", "{}"))
        )
        with Path(os.environ["GITHUB_ENV"]).open("a") as stream:
            stream.writelines(
                key + "=" + value + "\n" for key, value in sorted(values.items())
            )
            stream.write(
                "GALLERY_API_ORIGIN=http://localhost:4000\nNEXT_TELEMETRY_DISABLED=1\n"
            )
        print("Validated public-only build profile")
    elif args.mode == "build":
        result = build_bundle(
            Path.cwd(),
            args.output,
            args.server,
            args.frontend_bom,
            args.backend_bom,
            args.cert,
            args.commit,
        )
        print(
            json.dumps(
                {
                    k: result[k]
                    for k in ("commit", "encrypted_bytes", "unpacked_bytes", "files")
                }
            )
        )
    else:
        result = (
            extract_verified(args.archive, args.destination, args.commit)
            if args.mode == "extract"
            else verify_archive(args.archive, args.commit)
        )
        print(
            json.dumps(
                {
                    "verified": True,
                    "commit": result["commit"],
                    "files": len(result["files"]),
                }
            )
        )


if __name__ == "__main__":
    try:
        main()
    except (
        ValueError,
        OSError,
        KeyError,
        TypeError,
        RuntimeError,
        tarfile.TarError,
        subprocess.SubprocessError,
    ):
        # No environment values, archive contents or private build keys in logs.
        raise SystemExit(
            "Release bundle verification failed; retain private diagnostics."
        ) from None
