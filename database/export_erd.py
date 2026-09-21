"""Export ERD.drawio to PNG, SVG and a single PDF.

PNG for slides and quick viewing, SVG for Word/print because it stays sharp at
any zoom, PDF as one file to hand in.

    python database/export_erd.py
"""
import os
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "ERD.drawio")
OUT = os.path.join(HERE, "exports")

CANDIDATES = [
    r"C:\Program Files\draw.io\draw.io.exe",
    r"C:\Program Files (x86)\draw.io\draw.io.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Programs\draw.io\draw.io.exe"),
    "/Applications/draw.io.app/Contents/MacOS/draw.io",
    shutil.which("drawio") or "",
]


def find_drawio():
    for c in CANDIDATES:
        if c and os.path.exists(c):
            return c
    sys.exit("draw.io desktop not found. Install it, or export by hand from the app:\n"
             "  File > Export as > PNG/SVG/PDF, tick 'All Pages'.")


def slug(name):
    name = re.sub(r"^\d+\.\s*", "", name)   # the index is already the prefix
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def run(exe, args):
    # draw.io writes harmless GPU cache warnings to stderr; only the exit code matters
    p = subprocess.run([exe] + args + ["--no-sandbox"],
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return p.returncode == 0


def main():
    exe = find_drawio()
    os.makedirs(OUT, exist_ok=True)
    pages = [d.get("name") for d in ET.parse(SRC).getroot().findall("diagram")]
    print("%d pages via %s" % (len(pages), exe))

    ok = 0
    for i, name in enumerate(pages):
        base = "%02d-%s" % (i, slug(name))
        for fmt, extra in (("png", ["-s", "2", "--crop"]), ("svg", ["--crop"])):
            dest = os.path.join(OUT, base + "." + fmt)
            # draw.io numbers pages from 1 on the command line
            if run(exe, ["-x", "-f", fmt, "-p", str(i + 1), "-o", dest, SRC] + extra):
                ok += 1
            else:
                print("  FAILED %s" % dest)
        print("  %s" % base)

    pdf = os.path.join(OUT, "Codi-ERD.pdf")
    if run(exe, ["-x", "-f", "pdf", "-a", "--crop", "-o", pdf, SRC]):
        print("  Codi-ERD.pdf (all pages)")
        ok += 1

    print("\n%d files written to %s" % (ok, OUT))


if __name__ == "__main__":
    main()
