#!/usr/bin/env python3
"""Move 'Show all/Show less' button to top of recent sessions list."""
p = 'src/features/dashboard/Dashboard.tsx'
content = open(p, encoding='utf-8').read()

# Remove the bottom button (after allRecent.map closing) and add it at the top
# of the sessions list (right after <div className="space-y-3">)

old_bottom = '''                {allRecent.length > 5 && (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary-600 hover:underline"
                    onClick={() => setShowAllRecent((v) => !v)}
                  >
                    {showAllRecent ? 'Show less' : `Show all (${allRecent.length})`}
                  </button>
                )}'''

new_top = '''                {allRecent.length > 5 && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="text-xs font-medium text-primary-600 hover:underline"
                      onClick={() => setShowAllRecent((v) => !v)}
                    >
                      {showAllRecent ? 'Show less' : `Show all (${allRecent.length})`}
                    </button>
                  </div>
                )}'''

# The bottom block should appear once. Remove it.
assert old_bottom in content, f'Bottom button not found'
content = content.replace(old_bottom, '', 1)

# Now insert it right after the first <div className="space-y-3"> inside the recent sessions section
anchor = '<div className="space-y-3">'
assert anchor in content, f'space-y-3 anchor not found'
# Find the right one (the one in the recent sessions section, after "No sessions yet")
# It's the one after "No sessions yet. Start studying!"
marker = "No sessions yet. Start studying!"
idx = content.index(marker)
pos = content.index(anchor, idx)
insert_point = pos + len(anchor)
content = content[:insert_point] + '\n' + new_top + content[insert_point:]

open(p, 'w', encoding='utf-8').write(content)
print('Patch applied successfully')
