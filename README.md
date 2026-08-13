notes-api
=========

A small JSON API for notes. Node's standard library and nothing else.

It is one half of a pair: `local-repo-b` is a browser UI that talks to this.
They are separate repositories on purpose, because a change that has to land in
both is the interesting case.


Running it
----------

    ./setup.sh      # checks node, installs, runs the suite
    npm start       # http://localhost:8081

Two environment variables, both optional:

    PORT            what to listen on          (default 8081)
    NOTES_FILE      where the notes are kept   (default ./data/notes.json)


The routes
----------

    GET     /health           { ok, notes }
    GET     /notes            every note
    POST    /notes            { title, body? }   -> 201 and the note
    GET     /notes/:id        one note           -> 404 if there is not one
    PATCH   /notes/:id        { title?, body? }  -> only what was sent changes
    DELETE  /notes/:id        -> 204, or 404 if it was already gone

A note is `{ id, title, body }`. `title` is required and is trimmed; `body`
defaults to an empty string.

Errors are `{ "error": "..." }` with a status that means something: 400 for a
request that is wrong, 404 for a note that is not there, 405 for a method the
route does not have.


How it is laid out
------------------

    bin/notes-api.js    starts it, reads the environment
    src/server.js       routing and http
    src/store.js        the notes, and the file they live in
    test/               node --test

`src/server.js` exports `create({ file })` and returns a server without
listening on anything, so the tests can bring one up on port 0 and take it
down again.


Things that are deliberately not here
-------------------------------------

No auth, no pagination, no search. It listens on a private network in front of
a list of notes. Adding them would make it a bigger example rather than a
better one.
