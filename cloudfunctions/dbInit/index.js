const cloud = require('wx-server-sdk')
cloud.init({ env: 'cloud1-3g5evs3cb978a9b3' })
const db = cloud.database()

async function ensureOne(name) {
  try {
    await db.createCollection(name)
    return { name, created: true }
  } catch (e) {
    return { name, created: false, msg: String(e) }
  }
}

exports.main = async (event, context) => {
  const { collections = [], collection } = event || {}
  const list = collections.length ? collections : (collection ? [collection] : [])
  if (!list.length) return { code: 400, msg: 'no collections provided' }
  const results = []
  for (const n of list) {
    results.push(await ensureOne(n))
  }
  return { code: 200, results }
}
