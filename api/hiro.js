export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const path = req.url.replace('/api/hiro/', '')
  const url = `https://api.testnet.hiro.so/${path}`
  
  try {
    const response = await fetch(url, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'd0a95c5d7d15cc7ad23d37ded6b5fd22',
      },
      // body should only be sent for non-GET/HEAD methods
      body: (req.method !== 'GET' && req.method !== 'HEAD')
        ? JSON.stringify(req.body) 
        : undefined,
    })
    const data = await response.json()
    res.status(response.status).json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
