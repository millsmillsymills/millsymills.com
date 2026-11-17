"""Local packaging integration; npm retrieves only the committed public lock.

No AWS calls: the synthetic handler imports the actual production verifier.
"""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import zipfile

from importlib.util import spec_from_file_location, module_from_spec

ROOT = Path(__file__).resolve().parents[1]
spec = spec_from_file_location('builder', ROOT / 'scripts/build-webauthn-package.py')
builder = module_from_spec(spec)
spec.loader.exec_module(builder)


class PackageTest(unittest.TestCase):
    def test_read_only_wrapper_commands_do_not_build(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'scripts').mkdir()
            (root / 'infra').mkdir()
            (root / 'bin').mkdir()
            shutil.copyfile(ROOT / 'scripts/tf.sh', root / 'scripts/tf.sh')
            # No builder is present: invoking one would fail the test.
            terraform = root / 'bin/terraform'
            terraform.write_text('#!/bin/sh\nexit 0\n')
            terraform.chmod(0o755)
            env = {k: v for k, v in os.environ.items() if not k.startswith('GIT_')}
            env['PATH'] = str(root / 'bin') + os.pathsep + env['PATH']
            subprocess.run(['git', 'init', '--quiet', str(root)], check=True, env=env)
            for command in ('fmt', 'validate'):
                with self.subTest(command=command):
                    subprocess.run(['bash', 'scripts/tf.sh', 'millsymills', command], cwd=root, env=env, check=True, capture_output=True)
            self.assertFalse((root / 'infra/.terraform').exists())

    def test_fresh_filesystem_rebuild_and_source_change(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'infra/lambdas/webauthn_demo'
            source.mkdir(parents=True)
            (root / 'scripts').mkdir()
            shutil.copyfile(ROOT / 'scripts/build-webauthn-package.py', root / 'scripts/build-webauthn-package.py')
            for name in ('package.json', 'package-lock.json'):
                shutil.copyfile(ROOT / 'infra/lambdas/webauthn_demo' / name, source / name)
            handler = 'import { generateAuthenticationOptions } from "@simplewebauthn/server";\nconsole.log((await generateAuthenticationOptions({rpID: "example.test"})).rpId);\n'
            (source / 'index.mjs').write_text(handler)
            # Dirty source deps and fixtures must never contaminate the artifact.
            (source / 'node_modules').mkdir()
            (source / 'node_modules/poison').write_text('must not ship')
            (source / 'tests').mkdir()
            (source / 'tests/fixture').write_text('must not ship')
            first = builder.build(root)
            original = first.read_bytes()
            with zipfile.ZipFile(first) as archive:
                names = archive.namelist()
                self.assertFalse(any('poison' in n or n.startswith('tests/') or n.startswith('node_modules/@aws-sdk/') for n in names))
                extracted = root / 'extracted'
                archive.extractall(extracted)
            result = subprocess.run(['node', 'index.mjs'], cwd=extracted, check=True, capture_output=True, text=True)
            self.assertEqual(result.stdout.strip(), 'example.test')
            # Simulates unchanged remote install trigger + a completely fresh
            # local build directory: remote state is deliberately not consulted.
            shutil.rmtree(root / 'infra/.terraform')
            shutil.rmtree(source / 'node_modules')
            rebuilt = builder.build(root)
            self.assertEqual(rebuilt.name, first.name)
            self.assertEqual(rebuilt.read_bytes(), original)
            lock_hash = hashlib.sha256((source / 'package-lock.json').read_bytes()).digest()
            (source / 'index.mjs').write_text(handler + '// changed handler, unchanged dependencies\n')
            changed = builder.build(root)
            self.assertNotEqual(changed.name, first.name)
            self.assertEqual(first.read_bytes(), original)
            self.assertEqual(hashlib.sha256((source / 'package-lock.json').read_bytes()).digest(), lock_hash)
            self.assertFalse((source / 'node_modules').exists())
            # Corrupted output is never silently replaced under the same ID.
            changed.write_bytes(b'corrupt')
            with self.assertRaisesRegex(ValueError, 'immutable artifact'):
                builder.build(root)


if __name__ == '__main__':
    unittest.main()
