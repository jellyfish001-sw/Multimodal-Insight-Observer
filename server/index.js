const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const fs = require('fs');
const { OpenAI } = require('openai');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const URI = process.env.REACT_APP_MONGODB_URI || process.env.MONGODB_URI || process.env.REACT_APP_MONGO_URI;
const DB = 'chatapp';

let db;

async function connect() {
  const client = await MongoClient.connect(URI);
  db = client.db(DB);
  console.log('MongoDB connected');
}

app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family:sans-serif;padding:2rem;background:#00356b;color:white;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0">
        <div style="text-align:center">
          <h1>Chat API Server</h1>
          <p>Backend is running. Use the React app at <a href="http://localhost:3000" style="color:#ffd700">localhost:3000</a></p>
          <p><a href="/api/status" style="color:#ffd700">Check DB status</a></p>
        </div>
      </body>
    </html>
  `);
});

app.get('/api/status', async (req, res) => {
  try {
    const usersCount = await db.collection('users').countDocuments();
    const sessionsCount = await db.collection('sessions').countDocuments();
    res.json({ usersCount, sessionsCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Users ────────────────────────────────────────────────────────────────────

app.post('/api/users', async (req, res) => {
  try {
    const { username, password, email, firstName, lastName } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });
    const name = String(username).trim().toLowerCase();
    const existing = await db.collection('users').findOne({ username: name });
    if (existing) return res.status(400).json({ error: 'Username already exists' });
    const hashed = await bcrypt.hash(password, 10);
    await db.collection('users').insertOne({
      username: name,
      password: hashed,
      email: email ? String(email).trim().toLowerCase() : null,
      firstName: firstName ? String(firstName).trim() : '',
      lastName: lastName ? String(lastName).trim() : '',
      createdAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });
    const name = username.trim().toLowerCase();
    const user = await db.collection('users').findOne({ username: name });
    if (!user) return res.status(401).json({ error: 'User not found' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid password' });
    res.json({
      ok: true,
      username: name,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Sessions ─────────────────────────────────────────────────────────────────

app.get('/api/sessions', async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'username required' });
    const sessions = await db
      .collection('sessions')
      .find({ username })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(
      sessions.map((s) => ({
        id: s._id.toString(),
        agent: s.agent || null,
        title: s.title || null,
        createdAt: s.createdAt,
        messageCount: (s.messages || []).length,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const { username, agent } = req.body;
    if (!username) return res.status(400).json({ error: 'username required' });
    const { title } = req.body;
    const result = await db.collection('sessions').insertOne({
      username,
      agent: agent || null,
      title: title || null,
      createdAt: new Date().toISOString(),
      messages: [],
    });
    res.json({ id: result.insertedId.toString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    await db.collection('sessions').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/sessions/:id/title', async (req, res) => {
  try {
    const { title } = req.body;
    await db.collection('sessions').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { title } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Messages ─────────────────────────────────────────────────────────────────

app.post('/api/messages', async (req, res) => {
  try {
    const { session_id, role, content, imageData, charts, toolCalls } = req.body;
    if (!session_id || !role || content === undefined)
      return res.status(400).json({ error: 'session_id, role, content required' });
    const msg = {
      role,
      content,
      timestamp: new Date().toISOString(),
      ...(imageData && {
        imageData: Array.isArray(imageData) ? imageData : [imageData],
      }),
      ...(charts?.length && { charts }),
      ...(toolCalls?.length && { toolCalls }),
    };
    await db.collection('sessions').updateOne(
      { _id: new ObjectId(session_id) },
      { $push: { messages: msg } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    const doc = await db
      .collection('sessions')
      .findOne({ _id: new ObjectId(session_id) });
    const raw = doc?.messages || [];
    const msgs = raw.map((m, i) => {
      const arr = m.imageData
        ? Array.isArray(m.imageData)
          ? m.imageData
          : [m.imageData]
        : [];
      return {
        id: `${doc._id}-${i}`,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        images: arr.length
          ? arr.map((img) => ({ data: img.data, mimeType: img.mimeType }))
          : undefined,
        charts: m.charts?.length ? m.charts : undefined,
        toolCalls: m.toolCalls?.length ? m.toolCalls : undefined,
      };
    });
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── YouTube Channel Download ──────────────────────────────────────────────────
const YOUTUBE_API_KEY = process.env.REACT_APP_YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY;

function parseDuration(iso) {
  if (!iso) return null;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return iso;
  const h = parseInt(match[1] || 0, 10);
  const m = parseInt(match[2] || 0, 10);
  const s = parseInt(match[3] || 0, 10);
  return `${h > 0 ? h + ':' : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`;
}

app.get('/api/youtube/channel', async (req, res) => {
  if (!YOUTUBE_API_KEY) {
    return res.status(200).json({
      optional: true,
      message: 'YouTube Channel Download is optional. Use the sample file veritasium_channel_data.json in the Chat tab (drag it into the chat), or add REACT_APP_YOUTUBE_API_KEY to .env to download your own channel data.',
    });
  }
  try {
    const { url, maxVideos = 10 } = req.query;
    if (!url) return res.status(400).json({ error: 'url required' });
    const max = Math.min(Math.max(parseInt(maxVideos, 10) || 10, 1), 100);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (obj) => {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
      if (typeof res.flush === 'function') res.flush();
    };

    let channelId = null;
    const urlStr = String(url).trim();

    if (/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/.test(urlStr)) {
      channelId = urlStr.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/)[1];
    } else if (/youtube\.com\/@([a-zA-Z0-9_-]+)/.test(urlStr) || /youtube\.com\/c\/([a-zA-Z0-9_-]+)/.test(urlStr)) {
      const handle = urlStr.match(/@([a-zA-Z0-9_-]+)/)?.[1] || urlStr.match(/\/c\/([a-zA-Z0-9_-]+)/)?.[1];
      if (handle) {
        const r = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${handle}&key=${YOUTUBE_API_KEY}`);
        const j = await r.json();
        channelId = j.items?.[0]?.id;
      }
    } else if (/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/.test(urlStr) || /youtu\.be\/([a-zA-Z0-9_-]+)/.test(urlStr)) {
      const videoId = urlStr.match(/watch\?v=([a-zA-Z0-9_-]+)/)?.[1] || urlStr.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)?.[1];
      if (videoId) {
        send({ progress: 2, stage: 'Getting channel from video...' });
        const vRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YOUTUBE_API_KEY}`);
        const vData = await vRes.json();
        channelId = vData.items?.[0]?.snippet?.channelId;
      }
    }
    if (!channelId) {
      send({ error: 'Could not parse URL. Use a channel link (e.g. youtube.com/@channelname), a video link (youtube.com/watch?v=...), or youtu.be/VIDEO_ID' });
      return res.end();
    }

    send({ progress: 5, stage: 'Fetching channel info...' });
    const chRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet&id=${channelId}&key=${YOUTUBE_API_KEY}`);
    const chData = await chRes.json();
    const uploadsId = chData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    const channelTitle = chData.items?.[0]?.snippet?.title || 'Channel';

    if (!uploadsId) {
      send({ error: 'Could not find uploads playlist' });
      return res.end();
    }

    const videoIds = [];
    let pageToken = '';
    while (videoIds.length < max) {
      send({ progress: 10 + (videoIds.length / max) * 40, stage: `Fetching video list... (${videoIds.length}/${max})` });
      const plRes = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsId}&maxResults=${Math.min(50, max - videoIds.length)}&pageToken=${pageToken}&key=${YOUTUBE_API_KEY}`);
      const plData = await plRes.json();
      const items = plData.items || [];
      for (const it of items) {
        if (it.snippet?.resourceId?.videoId) videoIds.push(it.snippet.resourceId.videoId);
        if (videoIds.length >= max) break;
      }
      pageToken = plData.nextPageToken || '';
      if (!pageToken || videoIds.length >= max) break;
    }

    const videos = [];
    const batchSize = 50;
    for (let i = 0; i < videoIds.length; i += batchSize) {
      const batch = videoIds.slice(i, i + batchSize);
      send({ progress: 50 + ((i + batch.length) / videoIds.length) * 45, stage: `Fetching video metadata... (${Math.min(i + batchSize, videoIds.length)}/${videoIds.length})` });
      const vRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${batch.join(',')}&key=${YOUTUBE_API_KEY}`);
      const vData = await vRes.json();
      for (const v of vData.items || []) {
        const sn = v.snippet || {};
        const st = v.statistics || {};
        const cd = v.contentDetails || {};
        videos.push({
          video_id: v.id,
          title: sn.title || '',
          description: (sn.description || '').slice(0, 5000),
          duration: parseDuration(cd.duration),
          duration_iso: cd.duration || null,
          release_date: sn.publishedAt || null,
          view_count: parseInt(st.viewCount || 0, 10),
          like_count: parseInt(st.likeCount || 0, 10),
          comment_count: parseInt(st.commentCount || 0, 10),
          video_url: `https://www.youtube.com/watch?v=${v.id}`,
          thumbnail_url: sn.thumbnails?.high?.url || sn.thumbnails?.default?.url || null,
          transcript: null,
        });
      }
    }

    send({ progress: 95, stage: 'Finalizing...' });

    const result = {
      channel_id: channelId,
      channel_title: channelTitle,
      channel_url: urlStr,
      downloaded_at: new Date().toISOString(),
      video_count: videos.length,
      videos,
    };

    send({ progress: 100, done: true, data: result });
    res.end();
  } catch (err) {
    console.error('[YouTube]', err);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ error: err.message });
  }
});

// ── Final Synthesis: save prompt only (AI call is done in frontend) ─────────────

app.post('/api/save-final-prompt', (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Missing prompt' });
    }
    const projectRoot = path.resolve(__dirname, '..');
    const outputPath = path.join(projectRoot, 'final_prompt.txt');
    fs.writeFileSync(outputPath, prompt, 'utf8');
    console.log('\n========== FINAL PROMPT (saved to final_prompt.txt) ==========');
    console.log(prompt);
    console.log('================================================================\n');
    res.json({ ok: true });
  } catch (err) {
    console.error('[Save Final Prompt]', err);
    res.status(500).json({ error: err.message || 'Failed to save prompt' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

connect()
  .then(() => {
    app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
