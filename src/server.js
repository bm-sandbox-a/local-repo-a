'use strict'

// The HTTP surface. `node:http` and nothing else -- the routing table is six
// lines and a framework would be more to install, provision and keep current
// than it would remove.
//
// `create` returns a server rather than starting one. A test needs to listen on
// port 0 and be told which port it got; a module that calls `listen` at require
// time cannot be tested without also being run.

const http = require('node:http')
const { Store } = require('./store')

// The GUI is served from a different origin (a different repository, a
// different port), so the browser will preflight anything that is not a plain
// GET. Permissive on purpose: this listens on a private network in front of
// notes, and pretending otherwise would be security theatre in a fixture.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type'
}

function send (res, status, body) {
  const payload = body === undefined ? '' : JSON.stringify(body)
  res.writeHead(status, {
    ...CORS,
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload)
  })
  res.end(payload)
}

// Bounded on purpose. Without a limit any client can hold the process open
// forever by trickling bytes, and this is the sort of thing a fixture should
// get right so that a task touching it has something real to reason about.
const MAX_BODY = 64 * 1024

function readJson (req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('body too large'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (raw.trim() === '') return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(Object.assign(new Error('body is not valid json'), { status: 400 }))
      }
    })
    req.on('error', reject)
  })
}

function create ({ file }) {
  const store = new Store(file)

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const parts = url.pathname.split('/').filter(Boolean)

    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS)
        return res.end()
      }

      if (req.method === 'GET' && parts[0] === 'health' && parts.length === 1) {
        return send(res, 200, { ok: true, notes: store.list().length })
      }

      if (parts[0] !== 'notes') return send(res, 404, { error: 'no such route' })

      // `/notes`
      if (parts.length === 1) {
        if (req.method === 'GET') return send(res, 200, store.list())
        if (req.method === 'POST') {
          const note = store.add(await readJson(req))
          return send(res, 201, note)
        }
        return send(res, 405, { error: 'method not allowed' })
      }

      // `/notes/:id`
      if (parts.length === 2) {
        const id = Number(parts[1])
        // `Number('')` is 0 and `Number('1x')` is NaN -- both would otherwise
        // reach the store as a lookup that quietly finds nothing, which reads
        // as "deleted" rather than "you asked for something that is not an id".
        if (!Number.isInteger(id) || id < 1) {
          return send(res, 400, { error: 'id must be a positive integer' })
        }

        if (req.method === 'GET') {
          const note = store.get(id)
          return note ? send(res, 200, note) : send(res, 404, { error: 'no such note' })
        }
        if (req.method === 'PATCH') {
          const note = store.update(id, await readJson(req))
          return note ? send(res, 200, note) : send(res, 404, { error: 'no such note' })
        }
        if (req.method === 'DELETE') {
          return store.remove(id)
            ? send(res, 204)
            : send(res, 404, { error: 'no such note' })
        }
        return send(res, 405, { error: 'method not allowed' })
      }

      return send(res, 404, { error: 'no such route' })
    } catch (err) {
      send(res, err.status || 500, { error: err.message })
    }
  })
}

module.exports = { create }
