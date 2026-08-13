'use strict'

// The notes themselves, and the one file they are kept in.
//
// A store is constructed with a path rather than reading a module-level
// constant, because the tests need somewhere throwaway to write and a store
// that can only ever use one location makes that impossible without mocking
// the filesystem.

const fs = require('node:fs')
const path = require('node:path')

// The largest id in a list, or 0 for an empty one. Used only when the counter
// has to be recovered from the notes rather than read.
const highest = notes => notes.reduce((max, note) => Math.max(max, note.id || 0), 0)

// Ids are sequential rather than random, so that a test can assert on them and
// so that reading the file by hand tells you what order things arrived in.
//
// THE COUNTER IS STORED, not derived from the notes that are left. Deriving it
// as `max(id) + 1` is the obvious version and is wrong: delete the newest note
// and the next one created takes the id that just went away, so a client
// holding the old id now points at a different note. Nothing errors. It is
// simply the wrong note from then on.
class Store {
  constructor (file) {
    this.file = file
    const { notes, nextId } = this._read()
    this.notes = notes
    this.nextId = nextId
  }

  _read () {
    let parsed
    try {
      parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'))
    } catch (err) {
      if (err.code === 'ENOENT') return { notes: [], nextId: 1 }
      throw err
    }

    // The file used to be a bare list, before the counter had to be kept. One
    // read of the old shape rather than a migration step somebody has to know
    // to run -- and the counter starts above whatever is in there, so ids that
    // were handed out before the upgrade are still not reused.
    if (Array.isArray(parsed)) {
      return { notes: parsed, nextId: highest(parsed) + 1 }
    }

    // A file that exists but holds something else is a corrupted file, not an
    // empty one, and silently starting over would throw away what was in it.
    if (!parsed || !Array.isArray(parsed.notes)) {
      throw new Error(`${this.file}: expected a list of notes`)
    }

    // A counter that has fallen behind the notes it is supposed to be ahead of
    // would hand out an id that is already taken, so it is corrected on load
    // rather than trusted.
    return { notes: parsed.notes, nextId: Math.max(parsed.nextId || 1, highest(parsed.notes) + 1) }
  }

  _write () {
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    // Written whole and then moved into place. A half-written file is a
    // corrupted store, and this API is killed by a machine being rolled back
    // rather than by anything graceful.
    const tmp = `${this.file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify({ nextId: this.nextId, notes: this.notes }, null, 2))
    fs.renameSync(tmp, this.file)
  }

  list () {
    return this.notes.slice()
  }

  get (id) {
    return this.notes.find(note => note.id === id) || null
  }

  add ({ title, body }) {
    if (typeof title !== 'string' || title.trim() === '') {
      throw Object.assign(new Error('a note needs a title'), { status: 400 })
    }
    const note = {
      id: this.nextId++,
      title: title.trim(),
      body: typeof body === 'string' ? body : ''
    }
    this.notes.push(note)
    this._write()
    return note
  }

  update (id, { title, body }) {
    const note = this.get(id)
    if (!note) return null
    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim() === '') {
        throw Object.assign(new Error('a note needs a title'), { status: 400 })
      }
      note.title = title.trim()
    }
    if (body !== undefined) note.body = String(body)
    this._write()
    return note
  }

  remove (id) {
    const at = this.notes.findIndex(note => note.id === id)
    if (at === -1) return false
    this.notes.splice(at, 1)
    this._write()
    return true
  }
}

module.exports = { Store }
