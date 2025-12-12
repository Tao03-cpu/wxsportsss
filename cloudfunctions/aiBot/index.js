// cloudfunctions/aiBot/index.js
const cloud = require('wx-server-sdk');
const https = require('https');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 智谱 AI 配置
const API_KEY = process.env.API_KEY; 
const API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

// 1. 混合模式：规则回复库 (Pre-check)
const RULE_RESPONSES = {
  '深蹲': '🏋️‍♂️ **深蹲标准动作**：\n1. 双脚分开与肩同宽\n2. 背部挺直，核心收紧\n3. 像坐椅子一样下蹲，膝盖不要超过脚尖太多\n4. 站起时夹紧臀部！\n\n来，做个10次试试？💪',
  '平板支撑': '🧘‍♀️ **平板支撑要点**：\n身体呈一条直线，不要塌腰也不要撅屁股！坚持30秒，你能行的！🔥',
  'HIIT': '🔥 **HIIT 燃脂**：\n高强度间歇运动效率超高！建议：开合跳30秒 + 休息10秒 + 高抬腿30秒... 循环4组，爆汗预警！💦',
  '饮食': '🥗 **三分练七分吃**：\n- 多吃蛋白质（鸡胸肉、鱼、蛋）\n- 少吃糖和油炸食品\n- 晚上少吃碳水\n记得多喝水哦！💧',
  '你好': '👋 嗨！我是你的燃动教练！今天打算练点什么？胸、背、腿还是有氧？🏋️‍♂️'
};

const DUMMY_MEMBERS = [
  { name: '健身教练', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Coach&backgroundColor=b6e3f4', msg: '大家今天打卡了吗？' },
  { name: 'Alice', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice&backgroundColor=ffdfbf', msg: '刚跑完5公里，感觉不错！' },
  { name: 'Bob', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bob&backgroundColor=c0aede', msg: '今晚有人一起夜跑吗？' },
  { name: '燃动小助手', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Helper&backgroundColor=ffdfbf', msg: '欢迎新朋友加入部落！' }
];

async function getBotAvatar(name, fallback) {
  try {
    const res = await db.collection('bot_profiles').where({ name }).limit(1).get();
    if (res.data && res.data.length > 0 && res.data[0].avatarUrl) return res.data[0].avatarUrl;
  } catch (_) {}
  return fallback;
}

function callAiApi(messages, timeoutMs) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: "glm-4-flash",
      messages: messages,
      stream: false
    });

    const urlObj = new URL(API_URL);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Length': Buffer.byteLength(data),
        'Connection': 'keep-alive'
      },
      timeout: timeoutMs,
      agent: new https.Agent({ keepAlive: true })
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(responseBody);
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Parse error: ${e.message}`));
          }
        } else {
          reject(new Error(`API Error: ${res.statusCode} ${responseBody}`));
        }
      });
    });

    req.on('error', (e) => { reject(e); });
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(data);
    req.end();
  });
}

async function callAiApiAxios(messages, timeoutMs) {
  const payload = { model: "glm-4-flash", messages, stream: false };
  const res = await axios.post(API_URL, payload, {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    timeout: timeoutMs,
    httpsAgent: new https.Agent({ keepAlive: true })
  });
  return res.data;
}

async function callAiApiWithRetry(messages, timeoutMs, retries) {
  try {
    return await callAiApi(messages, timeoutMs);
  } catch (e) {
    if (retries > 0) {
      return await callAiApiWithRetry(messages, timeoutMs, retries - 1);
    }
    throw e;
  }
}

exports.main = async (event, context) => {
  const { action, message, tribeId, history = [] } = event;
  
  // --- 功能1：填充群内人员 ---
  if (action === 'populate') {
    if (!tribeId) return { code: 400 };
    try {
      const countRes = await db.collection('tribe_messages').where({ tribe_id: tribeId }).count();
      if (countRes.total > 0) return { code: 200, msg: 'already populated' };
      
      const avatars = {};
      for (const m of DUMMY_MEMBERS) {
        avatars[m.name] = await getBotAvatar(m.name, m.avatar);
      }
      const tasks = DUMMY_MEMBERS.map((m, i) => {
        return db.collection('tribe_messages').add({
          data: {
            tribe_id: tribeId,
            content: m.msg,
            sender_name: m.name,
            sender_avatar: avatars[m.name],
            sender_id: `mock_${i}`,
            create_time: db.serverDate({ offset: - (DUMMY_MEMBERS.length - i) * 60000 }),
            type: 'text'
          }
        });
      });
      await Promise.all(tasks);
      return { code: 200, msg: 'populated' };
    } catch (e) {
      return { code: 500, error: e.toString() };
    }
  }

  // --- 功能2：AI 聊天回复 ---
  if (action === 'chat') {
    if (!message || !tribeId) return { code: 400 };

    let aiText = '';
    
    // 2. 规则优先
    for (const key in RULE_RESPONSES) {
      if (message.includes(key)) {
        aiText = RULE_RESPONSES[key];
        break;
      }
    }

    // 3. AI 调用 (使用原生 https)
    if (!aiText) {
      try {
        const systemPrompt = `你是一个专业的健身教练，名字叫“燃动教练”。
你的性格：幽默风趣、充满活力、非常详细、富有鼓励性。
你的任务：
1. 回答用户关于健身、饮食、健康的问题。
2. 回答要具体，不要只说空话。
3. 适当使用Emoji表情包（💪🔥🥗🧘‍♂️）来活跃气氛。
4. 如果用户在闲聊，就用幽默的方式回应。
5. 如果用户@了你，请表现得格外热情。`;
        
        const messages = [
          { role: "system", content: systemPrompt },
          ...history.map(m => ({
            role: m.sender_id === 'AI_BOT' ? 'assistant' : 'user',
            content: m.content
          })),
          { role: "user", content: message }
        ];

        let apiRes = null;
        const timeoutToUse = Math.min(Math.max(typeof event.timeoutMs === 'number' ? event.timeoutMs : 15000, 12000), 18000);
        const retriesToUse = typeof event.retries === 'number' ? Math.max(1, Math.min(event.retries, 3)) : 2;
        if (API_KEY) {
          try {
            apiRes = await callAiApiWithRetry(messages, timeoutToUse, retriesToUse);
          } catch (e1) {
            try {
              apiRes = await callAiApiAxios(messages, timeoutToUse);
            } catch (e2) {
              apiRes = null;
            }
          }
          if (apiRes && apiRes.choices && apiRes.choices[0]) {
             aiText = apiRes.choices[0].message.content;
          }
        }
      } catch (err) {
        console.error('AI API Error', err);
        // 记录错误但不中断，走兜底逻辑
      }
    }

    // 4. 最终兜底
    if (!aiText) {
      const isMentioningBot = message.includes('@燃动小助手');
      if (isMentioningBot) {
         aiText = '教练正在热身中... 有什么问题大声告诉我！👂 (AI暂时离线)';
      } else {
         const fallbacks = [
           '生命在于运动，加油！💪',
           '今天流的汗，是明天性感的资本！🔥',
           '别停下，坚持就是胜利！🏃‍♂️',
           '我在呢！时刻准备着为你打气！✨'
         ];
         aiText = fallbacks[Math.floor(Math.random() * fallbacks.length)];
      }
    }

    try {
      await db.collection('tribe_messages').add({
        data: {
          tribe_id: tribeId,
          content: aiText,
          sender_name: '燃动小助手',
          sender_avatar: await getBotAvatar('燃动小助手', 'https://api.dicebear.com/7.x/bottts/svg?seed=Helper&backgroundColor=ffdfbf'), 
          sender_id: 'AI_BOT',
          create_time: db.serverDate(),
          type: 'text'
        }
      });
      return { code: 200, reply: aiText };
    } catch (err) {
      return { code: 500, error: err.toString() };
    }
  }
  
  return { code: 400, msg: 'Unknown action' };
};
