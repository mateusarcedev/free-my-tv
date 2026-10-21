#!/usr/bin/env python3
"""Extract only the two Geist fonts from the owner's own Claude HTML export.

The fonts are NOT committed to GitHub or redistributed. Their output paths
match the optional @font-face links in web/mateusarce.css.
"""
import base64
import gzip
import json
import pathlib
import re
import sys

def main():
    if len(sys.argv) != 2:
        sys.exit('Uso: python3 tools/import_mateusarce_fonts.py "TV Launcher.html"')
    raw = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8')
    def script(name):
        m = re.search(r'<script type="__bundler/' + name + r'">\s*(.*?)\s*</script>', raw, re.S)
        if not m:
            sys.exit('Este arquivo não é uma exportação HTML compatível: ' + name)
        return json.loads(m.group(1))
    manifest = script('manifest')
    template = script('template')
    output = pathlib.Path(__file__).resolve().parent.parent / 'web'
    for family, name in [('Geist', 'Geist.woff'), ('Geist Mono', 'GeistMono.woff')]:
        m = re.search(r'font-family:\s*["\x27]?' + re.escape(family) +
                      r'["\x27]?;\s*src:\s*url\(["\x27]?([a-f0-9-]{36})',
                      template, re.I)
        if not m or m.group(1) not in manifest:
            sys.exit('Fonte ausente na exportação: ' + family)
        entry = manifest[m.group(1)]
        if entry['mime'] not in ('font/woff', 'font/woff2', 'application/font-woff'):
            sys.exit('Tipo de fonte inesperado: ' + entry['mime'])
        data = base64.b64decode(entry['data'])
        if entry.get('compressed'):
            data = gzip.decompress(data)
        (output / name).write_bytes(data)
        print('Extraído para instalação local:', name)
    print('Os binários são ignorados pelo .gitignore e não precisam ir para o GitHub.')

if __name__ == '__main__':
    main()
