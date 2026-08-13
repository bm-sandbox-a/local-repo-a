'use strict'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { Store } = require('../src/store')

// Every test gets its own file. Sharing one would make the suite order
// dependent, which is the kind of failure that only shows up on somebody
// else's machine.
function tmpFile (t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return path.join(dir, 'notes.json')
}

test('a fresh store is empty', t => {
  const store = new Store(tmpFile(t))
  assert.deepStrictEqual(store.list(), [])
})

test('adding returns the note with an id', t => {
  const store = new Store(tmpFile(t))
  const note = store.add({ title: 'first', body: 'hello' })
  assert.strictEqual(note.id, 1)
  assert.strictEqual(note.title, 'first')
  assert.strictEqual(note.body, 'hello')
})

test('ids keep counting up across a reload', t => {
  const file = tmpFile(t)
  const store = new Store(file)
  store.add({ title: 'one' })
  store.add({ title: 'two' })

  const reopened = new Store(file)
  const third = reopened.add({ title: 'three' })
  assert.strictEqual(third.id, 3)
  assert.strictEqual(reopened.list().length, 3)
})

test('ids are not reused after a delete', t => {
  const store = new Store(tmpFile(t))
  store.add({ title: 'one' })
  const two = store.add({ title: 'two' })
  store.remove(two.id)

  const next = store.add({ title: 'three' })
  assert.strictEqual(next.id, 3, 'the id of a deleted note must not come back')
})

test('a title is required', t => {
  const store = new Store(tmpFile(t))
  assert.throws(() => store.add({ body: 'no title' }), /needs a title/)
  assert.throws(() => store.add({ title: '   ' }), /needs a title/)
})

test('titles are trimmed', t => {
  const store = new Store(tmpFile(t))
  assert.strictEqual(store.add({ title: '  padded  ' }).title, 'padded')
})

test('a missing body becomes an empty string', t => {
  const store = new Store(tmpFile(t))
  assert.strictEqual(store.add({ title: 'bare' }).body, '')
})

test('update changes only what it was given', t => {
  const store = new Store(tmpFile(t))
  const note = store.add({ title: 'before', body: 'kept' })

  const updated = store.update(note.id, { title: 'after' })
  assert.strictEqual(updated.title, 'after')
  assert.strictEqual(updated.body, 'kept')
})

test('update of a missing note is null, not an error', t => {
  const store = new Store(tmpFile(t))
  assert.strictEqual(store.update(99, { title: 'x' }), null)
})

test('remove reports whether it removed anything', t => {
  const store = new Store(tmpFile(t))
  const note = store.add({ title: 'doomed' })
  assert.strictEqual(store.remove(note.id), true)
  assert.strictEqual(store.remove(note.id), false)
})

test('a file in the old bare-list shape is still read', t => {
  const file = tmpFile(t)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify([{ id: 1, title: 'old', body: '' }]))

  const store = new Store(file)
  assert.strictEqual(store.list().length, 1)
  assert.strictEqual(store.add({ title: 'new' }).id, 2, 'must not reuse an id from the old file')
})

test('a counter that has fallen behind is corrected on load', t => {
  const file = tmpFile(t)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  // Hand-edited, or written by something that got it wrong. Trusting it would
  // hand out id 2 a second time.
  fs.writeFileSync(file, JSON.stringify({
    nextId: 2,
    notes: [{ id: 1, title: 'one', body: '' }, { id: 2, title: 'two', body: '' }]
  }))

  const store = new Store(file)
  assert.strictEqual(store.add({ title: 'three' }).id, 3)
})

test('a corrupt file is refused rather than started over', t => {
  const file = tmpFile(t)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '{"not":"a list"}')
  assert.throws(() => new Store(file), /expected a list of notes/)
})
