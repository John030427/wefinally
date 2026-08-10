const cloud = require('wx-server-sdk')
const collections = require('./collections')
const { withCollectionBootstrap } = require('./collectionBootstrapPolicy')

const db = cloud.database()
const _ = db.command

function col(name) {
  return db.collection(collections[name] || name)
}

function withCollection(name, operation) {
  const physicalName = collections[name] || name
  return withCollectionBootstrap({
    logicalName: name,
    physicalName,
    operation,
    createCollection: (collectionName) => db.createCollection(collectionName)
  })
}

function now() {
  return new Date()
}

function fallbackId(name, err) {
  const timeId = Date.now() * 1000 + Math.floor(Math.random() * 1000)
  console.warn(`fallback id for ${name}: ${(err && err.message) || err}`)
  return timeId
}

async function first(name, query) {
  const res = await withCollection(name, () => col(name).where(query).limit(1).get())
  return res.data && res.data[0] ? res.data[0] : null
}

async function list(name, query, limit) {
  const q = query || {}
  const max = limit || 100
  const res = await withCollection(name, () => col(name).where(q).limit(max).get())
  return res.data || []
}

async function byId(name, id) {
  const n = Number(id)
  if (!Number.isNaN(n)) {
    const row = await first(name, { id: n })
    if (row) return row
  }
  if (!id) return null
  try {
    const res = await withCollection(name, () => col(name).doc(String(id)).get())
    return res.data || null
  } catch (err) {
    return null
  }
}

async function nextId(name) {
  const id = String(name)
  try {
    await withCollection('system_counters', () => db.collection('system_counters').doc(id).update({
      data: {
        seq: _.inc(1),
        update_time: now()
      }
    }))
  } catch (updateErr) {
    try {
      await withCollection('system_counters', () => db.collection('system_counters').doc(id).set({
        data: {
          seq: 1,
          create_time: now(),
          update_time: now()
        }
      }))
      return 1
    } catch (setErr) {
      return fallbackId(name, setErr)
    }
  }
  try {
    const res = await withCollection('system_counters', () => db.collection('system_counters').doc(id).get())
    return Number(res.data.seq || 1)
  } catch (err) {
    return fallbackId(name, err)
  }
}

async function addWithId(name, data, prefix) {
  const id = await nextId(name)
  const doc = Object.assign({}, data, {
    _id: `${prefix || name}_${id}`,
    id,
    create_time: data.create_time || now(),
    update_time: data.update_time || now()
  })
  const writeData = Object.assign({}, doc)
  delete writeData._id
  await withCollection(name, () => col(name).doc(doc._id).set({ data: writeData }))
  return doc
}

async function updateByDoc(name, doc, data) {
  if (!doc || !doc._id) throw new Error('记录不存在')
  await withCollection(name, () => col(name).doc(doc._id).update({
    data: Object.assign({}, data, { update_time: now() })
  }))
  return Object.assign({}, doc, data, { update_time: now() })
}

async function removeByDoc(name, doc) {
  if (!doc || !doc._id) throw new Error('记录不存在')
  const result = await withCollection(name, () => col(name).doc(doc._id).remove())
  const removed = Number(result && result.stats && result.stats.removed || 0)
  if (removed !== 1) throw new Error('记录删除失败')
  return { removed }
}

function authError(message) {
  const err = new Error(message || '登录已过期，请重新登录')
  err.code = 401
  return err
}

module.exports = {
  db,
  _,
  col,
  now,
  first,
  list,
  byId,
  nextId,
  addWithId,
  updateByDoc,
  removeByDoc,
  authError,
  withCollection
}
