#!/usr/bin/env node
'use strict'

// Starting it. Everything configurable is an environment variable with a
// default that works, so `npm start` in a fresh checkout is enough.

const path = require('node:path')
const { create } = require('../src/server')

const port = Number(process.env.PORT || 8081)
const file = process.env.NOTES_FILE || path.join(__dirname, '..', 'data', 'notes.json')

const server = create({ file })

server.listen(port, () => {
  console.log(`notes-api listening on http://localhost:${port}`)
  console.log(`notes in ${file}`)
})

// Without this a Ctrl-C leaves the port held for as long as a keep-alive
// connection lives, and the next `npm start` fails with EADDRINUSE for reasons
// that look nothing like the cause.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
  })
}
