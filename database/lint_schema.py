"""Structural lint for schema-v6.sql, since no SQL Server instance is available
to run it against. Checks the things that actually break at CREATE time."""
import io
import re
import sys
from collections import defaultdict

import sys as _s
P = _s.argv[1] if len(_s.argv) > 1 else r"D:\CODE\Study\FPT\Ki_5\SWP391\database\schema-v6.sql"
sql = io.open(P, encoding="utf-8").read()

# strip block and line comments so they cannot produce false matches
body = re.sub(r"/\*.*?\*/", " ", sql, flags=re.S)
body = re.sub(r"--[^\n]*", " ", body)

tables = {}
for m in re.finditer(r"CREATE TABLE (\w+)\s*\((.*?)\n\);", body, re.S):
    tables[m.group(1)] = m.group(2)

fks = []          # (child, child_cols, parent, on_delete, constraint_name)
constraint_names = defaultdict(list)

for tname, tbody in tables.items():
    for cm in re.finditer(r"CONSTRAINT (\w+)", tbody):
        constraint_names[cm.group(1)].append(tname)
    for m in re.finditer(
            r"CONSTRAINT (\w+)\s*\n?\s*FOREIGN KEY\s*\(([^)]*)\)\s*"
            r"REFERENCES\s+(\w+)\s*\(([^)]*)\)([^,]*)", tbody):
        name, ccols, parent, pcols, tail = m.groups()
        on_delete = "CASCADE" if "ON DELETE CASCADE" in tail else "NO ACTION"
        fks.append((tname, ccols.strip(), parent, on_delete, name))

problems = []

# 1. every FK target table must exist
for child, ccol, parent, act, name in fks:
    if parent not in tables:
        problems.append("FK %s -> unknown table %s" % (name, parent))

# 2. constraint names must be unique database-wide in SQL Server
for name, owners in constraint_names.items():
    if len(owners) > 1:
        problems.append("duplicate constraint name %s in %s" % (name, owners))

# 3. index names must be unique too
idx = re.findall(r"CREATE (?:UNIQUE )?INDEX (\w+)", body)
for name in set(idx):
    if idx.count(name) > 1:
        problems.append("duplicate index name %s" % name)

# 4. multiple cascade paths - SQL Server error 1785. Walk every cascade chain
#    from each root table and flag a table reached twice.
cascade_children = defaultdict(list)
for child, ccol, parent, act, name in fks:
    if act == "CASCADE":
        cascade_children[parent].append(child)


def reachable(root):
    seen, dupes, stack = set(), set(), [root]
    while stack:
        cur = stack.pop()
        for ch in cascade_children.get(cur, []):
            if ch in seen:
                dupes.add(ch)
            seen.add(ch)
            stack.append(ch)
    return dupes


for root in tables:
    for d in reachable(root):
        problems.append("multiple cascade paths: DELETE on %s reaches %s twice" % (root, d))

# 5. a self-referencing FK may not cascade
for child, ccol, parent, act, name in fks:
    if child == parent and act == "CASCADE":
        problems.append("self-referencing cascade on %s (%s)" % (child, name))

# 6. runtime cascade conflict: X has a NO ACTION FK to Y, and a DELETE on some
#    root cascades into BOTH X and Y. Whichever order the engine picks, the
#    NO ACTION reference can be violated and the whole DELETE fails.
def cascade_set(root):
    seen, stack = set(), [root]
    while stack:
        cur = stack.pop()
        for ch in cascade_children.get(cur, []):
            if ch not in seen:
                seen.add(ch)
                stack.append(ch)
    return seen

for root in tables:
    hit = cascade_set(root)
    for child, ccol, parent, act, name in fks:
        if act == "NO ACTION" and child in hit and parent in hit:
            problems.append(
                "runtime cascade conflict: DELETE on %s cascades into both %s and %s, "
                "but %s.%s -> %s is NO ACTION" % (root, child, parent, child, ccol, parent))

print("tables: %d" % len(tables))
print("foreign keys: %d  (cascade: %d)"
      % (len(fks), sum(1 for f in fks if f[3] == "CASCADE")))
print("indexes: %d" % len(idx))
print("check constraints: %d" % len(re.findall(r"CONSTRAINT \w+\s*\n?\s*CHECK", body)))
print()
if problems:
    print("PROBLEMS:")
    for p in sorted(set(problems)):
        print("  -", p)
    sys.exit(1)
print("LINT CLEAN")
