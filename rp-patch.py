#!/usr/bin/env python3
"""RoutinePage: add isEditingSchedule, descriptive labels, conditional grid inputs."""
p = 'src/features/routines/RoutinePage.tsx'
content = open(p, encoding='utf-8').read()

# 1. Replace scheduleGridSaved with isEditingSchedule
old = '''  const [scheduleGridSaved, setScheduleGridSaved] = useState(false)'''
new = '''  const [isEditingSchedule, setIsEditingSchedule] = useState(false)'''
assert old in content, 'PATCH 1: anchor not found'
content = content.replace(old, new, 1)

# 2a. Update Edit button header to toggle isEditingSchedule
old = '''                <Button variant="secondary" size="sm" onClick={() => setScheduleGridSaved(false)}>Edit</Button>'''
new = '''                <Button variant="secondary" size="sm" onClick={() => setIsEditingSchedule(!isEditingSchedule)}>
                  {isEditingSchedule ? 'Save Schedule' : 'Edit Schedule'}
                </Button>'''
assert old in content, 'PATCH 2: anchor not found'
content = content.replace(old, new, 1)

# 2b. Remove the standalone Save Schedule button + Saved indicator from ScheduleGrid
old = '''        <Button variant="primary" size="sm" className="mt-3" onClick={saveSchedule}>Save Schedule</Button>
        {scheduleGridSaved && <span className="ml-2 text-xs text-green-600 dark:text-green-400">Saved</span>}'''
new = '''        {isEditingSchedule && (
          <Button variant="primary" size="sm" className="mt-3" onClick={() => { saveSchedule(); setIsEditingSchedule(false) }}>
            Save Schedule
          </Button>
        )}'''
assert old in content, 'PATCH 3: anchor not found'
content = content.replace(old, new, 1)

# 3. Make inputs conditional in ScheduleGrid
old = '''                      <input type="text" inputMode="numeric" pattern="[0-9]*"
                        className="w-16 text-center rounded border border-slate-200 bg-white px-1 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        placeholder="min"
                        value={draft.minutes}
                        onChange={(e) => { setDraft(subject.id, d, 'minutes', e.target.value); setScheduleGridSaved(false) }} />
                      <input type="text" className="mt-0.5 block w-16 rounded border border-slate-200 bg-white px-1 text-[10px] leading-tight dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        placeholder="notes"
                        value={draft.notes}
                        onChange={(e) => setDraft(subject.id, d, 'notes', e.target.value)} />'''
new = '''                      {isEditingSchedule ? (
                        <>
                          <input type="text" inputMode="numeric" pattern="[0-9]*"
                            className="w-16 text-center rounded border border-slate-200 bg-white px-1 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            placeholder="min"
                            value={draft.minutes}
                            onChange={(e) => setDraft(subject.id, d, 'minutes', e.target.value)} />
                          <input type="text" className="mt-0.5 block w-16 rounded border border-slate-200 bg-white px-1 text-[10px] leading-tight dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            placeholder="notes"
                            value={draft.notes}
                            onChange={(e) => setDraft(subject.id, d, 'notes', e.target.value)} />
                        </>
                      ) : (
                        <span className="block text-center text-xs text-slate-700 dark:text-slate-300">
                          {getSaved(subject.id, d)?.targetMinutes
                            ? `${getSaved(subject.id, d).targetMinutes}m` +
                              (getSaved(subject.id, d).notes ? ` · ${getSaved(subject.id, d).notes}` : '')
                            : '—'}
                        </span>
                      )}'''
assert old in content, 'PATCH 4: anchor not found'
content = content.replace(old, new, 1)

# 5. Add descriptive labels in the Schedule section
old = '''          {/* Today's Schedule */}
          {todaysSchedule.length > 0 && ('''
new = '''          {/* Today's Schedule */}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Plan your week by allocating time per subject per day.
          </p>
          {todaysSchedule.length > 0 && ('''
assert old in content, 'PATCH 5: anchor not found'
content = content.replace(old, new, 1)

# 6. Add descriptive label at the top of the Routines tab
old = '''      {tab === 'routines' && (
        <>
      {todaysRoutines.length > 0 && ('''
new = '''      {tab === 'routines' && (
        <>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Set daily targets for recurring goals (e.g., 30 mins reading).
      </p>
      {todaysRoutines.length > 0 && ('''
assert old in content, 'PATCH 6: anchor not found'
content = content.replace(old, new, 1)

# 7. Rename setScheduleGridSaved calls in onChange to setIsEditingSchedule(false)
old = '''onChange={(e) => { setDraft(subject.id, d, 'minutes', e.target.value); setScheduleGridSaved(false) }}'''
# This shouldn't exist anymore since we already replaced the input block.
# Check if it does.
if old in content:
    content = content.replace(old, "onChange={(e) => setDraft(subject.id, d, 'minutes', e.target.value)}")

open(p, 'w', encoding='utf-8').write(content)
print('All patches applied successfully')
