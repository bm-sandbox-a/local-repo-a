'use strict'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { create } = require('../src/server')

// Listening on port 0 and asking what was given. A fixed port makes the suite
// fail when anything else on the machine happens to hold it, including a
// previous run of this same suite that has not finished closing.
async function serve (t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-api-'))
  const server = create({ file: path.join(dir, 'notes.json') })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => {
    server.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const base = `http://127.0.0.1:${server.address().port}`
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    })
    const text = await res.text()
    return { status: res.status, body: text === '' ? null : JSON.parse(text) }
  }
  // Hung off the helper so the one test that needs to send something the
  // helper cannot produce -- a malformed body -- can still reach the server.
  call.base = base
  return call
}

test('health reports how many notes there are', async t => {
  const call = await serve(t)
  const res = await call('GET', '/health')
  assert.strictEqual(res.status, 200)
  assert.deepStrictEqual(res.body, { ok: true, notes: 0 })
})

test('a posted note comes back from the list', async t => {
  const call = await serve(t)

  const created = await call('POST', '/notes', { title: 'buy milk' })
  assert.strictEqual(created.status, 201)
  assert.strictEqual(created.body.title, 'buy milk')

  const listed = await call('GET', '/notes')
  assert.strictEqual(listed.status, 200)
  assert.strictEqual(listed.body.length, 1)
  assert.strictEqual(listed.body[0].id, created.body.id)
})

test('one note can be fetched by id', async t => {
  const call = await serve(t)
  const created = await call('POST', '/notes', { title: 'alone' })

  const got = await call('GET', `/notes/${created.body.id}`)
  assert.strictEqual(got.status, 200)
  assert.strictEqual(got.body.title, 'alone')
})

test('a note that is not there is a 404', async t => {
  const call = await serve(t)
  assert.strictEqual((await call('GET', '/notes/42')).status, 404)
})

test('an id that is not a number is a 400, not a 404', async t => {
  const call = await serve(t)
  const res = await call('GET', '/notes/banana')
  assert.strictEqual(res.status, 400)
  assert.match(res.body.error, /positive integer/)
})

test('a note without a title is refused', async t => {
  const call = await serve(t)
  const res = await call('POST', '/notes', { body: 'orphan' })
  assert.strictEqual(res.status, 400)
  assert.match(res.body.error, /needs a title/)
})

test('a body that is not json is refused', async t => {
  const call = await serve(t)

  // Sent by hand: the helper always serialises valid json, and the point here
  // is what happens when a client does not.
  const res = await fetch(`${call.base}/notes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{ this is not json'
  })

  assert.strictEqual(res.status, 400)
  assert.match((await res.json()).error, /not valid json/)
})

test('an empty body is treated as an empty object, so it fails on the title', async t => {
  const call = await serve(t)

  const res = await fetch(`${call.base}/notes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: ''
  })

  assert.strictEqual(res.status, 400)
  assert.match((await res.json()).error, /needs a title/)
})

test('patch changes a note in place', async t => {
  const call = await serve(t)
  const created = await call('POST', '/notes', { title: 'draft', body: 'x' })

  const patched = await call('PATCH', `/notes/${created.body.id}`, { title: 'final' })
  assert.strictEqual(patched.status, 200)
  assert.strictEqual(patched.body.title, 'final')
  assert.strictEqual(patched.body.body, 'x')
})

test('delete removes it and says nothing', async t => {
  const call = await serve(t)
  const created = await call('POST', '/notes', { title: 'temporary' })

  const deleted = await call('DELETE', `/notes/${created.body.id}`)
  assert.strictEqual(deleted.status, 204)
  assert.strictEqual(deleted.body, null)

  assert.strictEqual((await call('GET', '/notes')).body.length, 0)
})

test('deleting twice is a 404 the second time', async t => {
  const call = await serve(t)
  const created = await call('POST', '/notes', { title: 'temporary' })
  await call('DELETE', `/notes/${created.body.id}`)
  assert.strictEqual((await call('DELETE', `/notes/${created.body.id}`)).status, 404)
})

test('an unknown route is a 404', async t => {
  const call = await serve(t)
  assert.strictEqual((await call('GET', '/nothing/here')).status, 404)
})

test('a method the route does not have is a 405', async t => {
  const call = await serve(t)
  assert.strictEqual((await call('DELETE', '/notes')).status, 405)
})
