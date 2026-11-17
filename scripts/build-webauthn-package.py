#!/usr/bin/env python3
"""Build a content-addressed production Lambda ZIP, without touching source deps.

Requires Node >=22, npm and Python 3. Run before Terraform plan/apply (tf.sh does
this automatically). AWS SDK packages remain supplied by the Lambda runtime.
"""
import hashlib
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile


def build(root):
    source = root / 'infra/lambdas/webauthn_demo'
    inputs = [source / name for name in ('index.mjs', 'package.json', 'package-lock.json')]
    inputs.append(root / 'scripts/build-webauthn-package.py')
    # Keep this ordering in sync with webauthn_demo_build_id in Terraform.
    identity = hashlib.sha256(''.join(hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs).encode()).hexdigest()
    destination = root / 'infra/.terraform/webauthn' / (identity + '.zip')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='webauthn-build-') as directory:
        stage = Path(directory)
        for path in inputs[:3]:
            shutil.copyfile(path, stage / path.name)
        subprocess.run(['npm', 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], cwd=stage, check=True)
        subprocess.run(['node', '--input-type=module', '-e', 'await import("@simplewebauthn/server")'], cwd=stage, check=True)
        # Fixed order, timestamp and permissions make identical inputs reproducible.
        with tempfile.NamedTemporaryFile(dir=destination.parent, suffix='.zip', delete=False) as output:
            pending = Path(output.name)
        try:
            with zipfile.ZipFile(pending, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
                for path in sorted(stage.rglob('*')):
                    if path.is_symlink():
                        raise ValueError(f'Unexpected symlink in Lambda package: {path.relative_to(stage)}')
                    if path.is_file():
                        info = zipfile.ZipInfo(path.relative_to(stage).as_posix(), (1980, 1, 1, 0, 0, 0))
                        info.create_system = 3
                        info.external_attr = 0o100644 << 16
                        info.compress_type = zipfile.ZIP_DEFLATED
                        archive.writestr(info, path.read_bytes())
            if destination.exists() and destination.read_bytes() != pending.read_bytes():
                raise ValueError('Package changed for identical build inputs; refusing to replace immutable artifact')
            if not destination.exists():
                pending.replace(destination)
        finally:
            pending.unlink(missing_ok=True)
    return destination


if __name__ == '__main__':
    print(build(Path(__file__).resolve().parents[1]))
