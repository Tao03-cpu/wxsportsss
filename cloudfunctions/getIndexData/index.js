// 引用 微信云函数 SDK
const cloud = require('wx-server-sdk')
cloud.init({ env: "cloud1-3g5evs3cb978a9b3" })
// 获取数据库实例
const db = cloud.database()

// 定义数组随机打乱函数
function shuffle(arr) {
  return arr.sort(() => Math.random() - 0.5)
}//Math.random()让数组随机排序

function hasImage(doc) {
  const u = doc.imageUrl || doc.fileID || doc.fileId || doc.url || doc.cover || doc.img || doc.image
  return !!u
}

function pickImg(obj) {
  return obj.imageUrl || obj.fileID || obj.fileId || obj.url || obj.cover || obj.img || obj.image || ''
}

// 从集合随机抽取 N 条
async function getRandomDocs(collection, count, requireImage = false) {
//查询集合总记录数
  const totalRes = await db.collection(collection).count()
  const total = totalRes.total

  if (total === 0) return []

  // 如果总数 <= 目标数量，则随机打乱后返回全部
  if (total <= count) {
    const res = await db.collection(collection).get()
    const list = requireImage ? res.data.filter(hasImage) : res.data
    return shuffle(list).slice(0, count)
  }

  // 随机索引抽取
  const randomIndexes = []
  while (randomIndexes.length < count) {
    const idx = Math.floor(Math.random() * total)
    if (!randomIndexes.includes(idx)) {
      randomIndexes.push(idx)
    }
  }

  const result = []
  for (const index of randomIndexes) {
    const res = await db.collection(collection).skip(index).limit(1).get()
    if (res.data.length > 0) {
      const doc = res.data[0]
      if (!requireImage || hasImage(doc)) result.push(doc)
    }
  }
  return result
}

// 主函数（实际给前端返回的数据）
exports.main = async () => {
  //获取轮播图（banner 集合随机 2 条）
  let bannerList = await getRandomDocs("banner", 3, true)

  //获取推荐运动（sports 集合随机 4 条）
  let sportList = await getRandomDocs("sports", 4, true)
  
  const techniqueList = await getRandomDocs("techniques", 5, false)

  // 将 cloud:// 文件ID 转为临时URL，提升真机展示稳定性
  try {
    const toResolve = []
    bannerList.forEach(b => { const u = pickImg(b); if (u && String(u).startsWith('cloud://')) toResolve.push(u) })
    sportList.forEach(s => { const u = pickImg(s); if (u && String(u).startsWith('cloud://')) toResolve.push(u) })

    let map = {}
    if (toResolve.length) {
      const r = await cloud.getTempFileURL({ fileList: toResolve })
      ;(r.fileList || []).forEach(f => { map[f.fileID] = f.tempFileURL })
    }

    const safeUrl = (u) => {
      if (!u) return ''
      if (map[u]) return map[u]
      if (String(u).startsWith('cloud://')) return ''
      if (String(u).startsWith('https://')) return u
      return ''
    }

    bannerList = bannerList.map(b => { const u = pickImg(b); return { ...b, imageUrl: safeUrl(u) || b.imageUrl || '' } })
    sportList = sportList.map(s => { const u = pickImg(s); return { ...s, imageUrl: safeUrl(u) || s.imageUrl || '' } })
  } catch (_) {}

  return {
    bannerList,
    sportList,
    techniqueList
  }
}
