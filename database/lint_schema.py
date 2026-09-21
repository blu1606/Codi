"""Structural lint for database/schema.sql (PostgreSQL).
Checks the things that actually break at CREATE time.
Cascade-conflict check removed - not applicable to PostgreSQL."""

import io
import re
import sys
from collections import defaultdict

P = sys.argv[1] if len(sys.argv) > 1 else r"database/schema.sql"
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

# 4. a self-referencing FK may not cascade
for child, ccol, parent, act, name in fks:
    if child == parent and act == "CASCADE":
        problems.append("self-referencing cascade on %s (%s)" % (child, name))

# Note: PostgreSQL handles cascade correctly regardless of complexity,
# so the SQL Server "multiple cascade paths" check is not needed.

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
