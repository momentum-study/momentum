#!/usr/bin/env python3
"""Fix duplicate timer display and stagnant total in PomodoroTimer."""
p = 'src/components/widgets/PomodoroTimer.tsx'
content = open(p, encoding='utf-8').read()

# Fix 1: Hide original timer display when YPT view is active
old1 = """      {/* Timer display */}
      <div className="text-center text-5xl font-bold tabular-nums text-slate-800 dark:text-slate-100">
        {fmt(currentSeconds)}
      </div>"""
new1 = """      {/* Timer display — hidden when YPT simple view is active */}
      {!(mode === 'simple' && (simpleStartedAt !== null || simplePausedOffset > 0)) && (
        <div className="text-center text-5xl font-bold tabular-nums text-slate-800 dark:text-slate-100">
          {fmt(currentSeconds)}
        </div>
      )}"""
assert old1 in content, 'Fix 1: old not found'
content = content.replace(old1, new1, 1)
print('Fix 1 applied')

# Fix 2: Hide Studying label when YPT view active
old2 = """        ) : (
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Studying <span className="font-semibold">{data.subjects.find((s) => s.id === subjectId)?.name}</span>
          </div>
        )}"""
new2 = """        ) : !(mode === 'simple' && (simpleStartedAt !== null || simplePausedOffset > 0)) ? (
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Studying <span className="font-semibold">{data.subjects.find((s) => s.id === subjectId)?.name}</span>
          </div>
        ) : null}"""
assert old2 in content, 'Fix 2: old not found'
content = content.replace(old2, new2, 1)
print('Fix 2 applied')

# Fix 3: Remove simplePausedOffset from total (already included via simpleSeconds when paused)
old3 = "    return committed + live + (simplePausedOffset / 60)"
new3 = "    return committed + live"
assert old3 in content, 'Fix 3: old not found'
content = content.replace(old3, new3, 1)
print('Fix 3 applied')

open(p, 'w', encoding='utf-8').write(content)
print('All fixes applied')
