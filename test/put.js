'use strict'

const fs = require('@npmcli/fs')
const index = require('../lib/entry-index')
const memo = require('../lib/memoization')
const t = require('tap')
const ssri = require('ssri')

const CONTENT = Buffer.from('foobarbaz', 'utf8')
const KEY = 'my-test-key'
const INTEGRITY = ssri.fromData(CONTENT).toString()
const METADATA = { foo: 'bar' }
const contentPath = require('../lib/content/path')

const put = require('..').put

t.test('basic bulk insertion', (t) => {
  const CACHE = t.testdir()
  return put(CACHE, KEY, CONTENT)
    .then((integrity) => {
      t.equal(integrity.toString(), INTEGRITY, 'returned content integrity')
      const dataPath = contentPath(CACHE, integrity)
      return fs.readFile(dataPath)
    })
    .then((data) => {
      t.same(data, CONTENT, 'content was correctly inserted')
    })
})

t.test('basic stream insertion', (t) => {
  const CACHE = t.testdir()
  let int
  const stream = put.stream(CACHE, KEY).on('integrity', (i) => {
    int = i
  })
  return stream.end(CONTENT).promise()
    .then(() => {
      t.equal(int.toString(), INTEGRITY, 'returned integrity matches expected')
      return fs.readFile(contentPath(CACHE, int))
    })
    .then((data) => {
      t.same(data, CONTENT, 'contents are identical to inserted content')
    })
})

t.test('adds correct entry to index before finishing', (t) => {
  const CACHE = t.testdir()
  return put(CACHE, KEY, CONTENT, { metadata: METADATA })
    .then(() => {
      return index.find(CACHE, KEY)
    })
    .then((entry) => {
      t.ok(entry, 'got an entry')
      t.equal(entry.key, KEY, 'entry has the right key')
      t.equal(entry.integrity, INTEGRITY, 'entry has the right key')
      t.same(entry.metadata, METADATA, 'metadata also inserted')
    })
})

t.test('optionally memoizes data on bulk insertion', (t) => {
  const CACHE = t.testdir()
  return put(CACHE, KEY, CONTENT, {
    metadata: METADATA,
    memoize: true,
  })
    .then((integrity) => {
      t.equal(integrity.toString(), INTEGRITY, 'integrity returned as usual')
      return index.find(CACHE, KEY) // index.find is not memoized
    })
    .then((entry) => {
      t.same(
        memo.get(CACHE, KEY),
        {
          data: CONTENT,
          entry: entry,
        },
        'content inserted into memoization cache by key'
      )
      t.same(
        memo.get.byDigest(CACHE, INTEGRITY),
        CONTENT,
        'content inserted into memoization cache by integrity'
      )
    })
})

t.test('optionally memoizes data on stream insertion', (t) => {
  const CACHE = t.testdir()
  let int
  const stream = put
    .stream(CACHE, KEY, {
      metadata: METADATA,
      memoize: true,
    })
    .on('integrity', (i) => {
      int = i
    })
  return stream.end(CONTENT).promise()
    .then(() => {
      t.equal(int.toString(), INTEGRITY, 'integrity emitted as usual')
      return fs.readFile(contentPath(CACHE, int))
    })
    .then((data) => {
      t.same(data, CONTENT, 'contents are identical to inserted content')
      return index.find(CACHE, KEY) // index.find is not memoized
    })
    .then((entry) => {
      t.same(
        memo.get(CACHE, KEY),
        {
          data: CONTENT,
          entry: entry,
        },
        'content inserted into memoization cache by key'
      )
      t.same(
        memo.get.byDigest(CACHE, INTEGRITY),
        CONTENT,
        'content inserted into memoization cache by integrity'
      )
    })
})

t.test('errors if integrity errors', (t) => {
  const CACHE = t.testdir()
  return put(CACHE, KEY, CONTENT, {
    integrity: 'sha1-BaDDigEST',
  }).catch((err) => {
    t.equal(err.code, 'EINTEGRITY', 'got error from bad integrity')
  })
})

t.test('signals error if error writing to cache', { saveFixture: true }, (t) => {
  const CACHE = t.testdir()
  return Promise.all([
    put(CACHE, KEY, CONTENT, {
      size: 2,
    })
      .then(() => {
        throw new Error('expected to get a bad size error')
      })
      .catch((err) => err),

    put.stream(CACHE, KEY, { size: 2 }).end(CONTENT).promise()
      .then(() => {
        throw new Error('expected to get a bad size error')
      })
      .catch((err) => err),
  ]).then(([bulkErr, streamErr]) => {
    t.equal(bulkErr.code, 'EBADSIZE', 'got error from bulk write')
    t.equal(streamErr.code, 'EBADSIZE', 'got error from stream write')
  })
})
