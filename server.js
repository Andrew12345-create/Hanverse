import express from 'express';
import pkg from 'pg';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const { Pool } = pkg;
const app = express();

// Resolve uploads directory relative to project root
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const BASE_URL   = '/uploads';

// Ensure uploads directory exists
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) { /* ignore */ }
// Serve uploaded files
app.use(BASE_URL, express.static(UPLOAD_DIR, { maxAge: '7d', immutable: true }));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to database:', err.stack);
  } else {
    console.log('Database connected successfully');
    release();
  }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Get user from database
    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = userResult.rows[0];

    // Verify password (using bcrypt for comparison)
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Fetch all related user data
    const progressResult = await pool.query(
      'SELECT * FROM user_progress WHERE user_id = $1',
      [user.user_id]
    );

    const achievementsResult = await pool.query(
      'SELECT * FROM achievements WHERE user_id = $1',
      [user.user_id]
    );

    const dailyGoalsResult = await pool.query(
      'SELECT * FROM daily_goals WHERE user_id = $1 AND goal_date = CURRENT_DATE',
      [user.user_id]
    );

    const notificationsResult = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [user.user_id]
    );

    const settingsResult = await pool.query(
      'SELECT * FROM user_settings WHERE user_id = $1',
      [user.user_id]
    );

    const vocabResult = await pool.query(
      'SELECT * FROM vocabulary_progress WHERE user_id = $1',
      [user.user_id]
    );

    // Update last_active and streak
    const today = new Date();
    const lastActive = new Date(user.last_active);
    const daysDiff = Math.floor((today - lastActive) / (1000 * 60 * 60 * 24));

    let newStreak = user.streak_days;
    if (daysDiff === 1) {
      newStreak += 1;
    } else if (daysDiff > 1) {
      newStreak = 1;
    }

    // Update user (no login XP - users earn XP through lessons)
    await pool.query(
      `UPDATE users 
       SET last_active = CURRENT_DATE, streak_days = $1, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2`,
      [newStreak, user.user_id]
    );

    // Return all user data (no bonus XP on login)
    res.json({
      success: true,
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        xp: user.xp,
        level: user.level,
        streak_days: newStreak,
        profile_picture: user.profile_picture,
        created_at: user.created_at
      },
      progress: progressResult.rows,
      achievements: achievementsResult.rows,
      dailyGoals: dailyGoalsResult.rows,
      notifications: notificationsResult.rows,
      settings: settingsResult.rows[0] || null,
      vocabulary: vocabResult.rows
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Signup endpoint
app.post('/api/signup', async (req, res) => {
  try {
    const { email, password, fullName, username } = req.body;

    if (!email || !password || !fullName || !username) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email or username already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, full_name, last_active)
       VALUES ($1, $2, $3, $4, CURRENT_DATE)
       RETURNING *`,
      [username, email, passwordHash, fullName]
    );

    const user = result.rows[0];

    // Create default settings
    await pool.query(
      `INSERT INTO user_settings (user_id)
       VALUES ($1)`,
      [user.user_id]
    );

    res.json({
      success: true,
      message: 'Account created successfully',
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        xp: user.xp || 0,
        level: user.level || 1,
        streak_days: 0
      }
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Server error during signup' });
  }
});

// Get user data endpoint
app.get('/api/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const userResult = await pool.query(
      'SELECT * FROM users WHERE user_id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    const progressResult = await pool.query(
      'SELECT * FROM user_progress WHERE user_id = $1 ORDER BY completed_at DESC',
      [userId]
    );

    const achievementsResult = await pool.query(
      'SELECT * FROM achievements WHERE user_id = $1',
      [userId]
    );

    const notificationsResult = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [userId]
    );

    const settingsResult = await pool.query(
      'SELECT * FROM user_settings WHERE user_id = $1',
      [userId]
    );

    const vocabResult = await pool.query(
      'SELECT * FROM vocabulary_progress WHERE user_id = $1',
      [userId]
    );

    res.json({
      user,
      progress: progressResult.rows,
      achievements: achievementsResult.rows,
      notifications: notificationsResult.rows,
      settings: settingsResult.rows[0] || null,
      vocabulary: vocabResult.rows
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error fetching user data' });
  }
});

// ─── Upload / update profile picture ───
app.post('/api/upload-pfp', async (req, res) => {
  try {
    const userId = req.body.user_id;
    if (!userId) return res.status(400).json({ error: 'user_id is required' });

    /* Detect multipart vs JSON body */
    const ct = req.get('content-type') || '';

    if (ct.includes('multipart/form-data')) {
      /* ── multipart file upload ── */
      const boundary = ct.split('boundary=')[1];
      if (!boundary) return res.status(400).json({ error: 'No multipart boundary' });

      const chunks = [];
      await new Promise((resolve) => {
        req.on('data', c => chunks.push(c));
        req.on('end', resolve);
      });
      const buf = Buffer.concat(chunks);

      /* Parse body text for user_id */
      const bodyText = buf.toString('utf8');
      const uidMatch = bodyText.match(/name="user_id"\s*(?:;\s*filename="[^"]*")?\s*\r?\n(?:Content-Type:.*\r?\n)?\r?\n([^\r\n]+)/);
      const uid = uidMatch ? uidMatch[1].trim() : String(userId);

      /* Escape boundary chars for use inside a RegExp */
      var esc  = boundary.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      var endB = '--\\s*' + esc;
      /* Parse filename + file bytes */
      var fileHeaderRe = new RegExp(
        'name="file"\\s*;?\\s*filename="([^"]+)"\\s*\\r?\\nContent-Type:\\s*([^\\r\\n]+)\\r?\\n\\r?\\n([\\s\\S]*?)(?=\\r?\\n--\\s*' + endB + ')',
        'i'
      );
      const fileMatch = bodyText.match(fileHeaderRe);
      if (!fileMatch) return res.status(400).json({ error: 'No file field found' });

      const [, rawName, mimeType, rawData] = fileMatch;
      if (!rawData) return res.status(400).json({ error: 'Empty file' });

      const ext = path.extname(rawName).toLowerCase();
      const allowed = ['.jpg','.jpeg','.png','.gif','.webp'];
      if (!allowed.includes(ext)) {
        return res.status(400).json({ error: 'Unsupported image type. Use JPG, PNG, GIF or WebP.' });
      }

      const fname = `pfp_${uid}_${Date.now()}${ext}`;
      const fpath = path.join(UPLOAD_DIR, fname);
      fs.writeFileSync(fpath, Buffer.from(rawData, 'binary'));

      /* Update DB */
      await pool.query('UPDATE users SET profile_picture = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2', [`${BASE_URL}/${fname}`, uid]);

      return res.json({ success: true, message: 'Profile picture uploaded', url: `${BASE_URL}/${fname}` });
    }

    /* ── JSON body: { user_id, image: dataUrl|url } ── */
    if (ct.includes('application/json')) {
      const { image } = req.body;
      if (!image) return res.status(400).json({ error: 'image field required' });

      await pool.query('UPDATE users SET profile_picture = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2', [image, userId]);
      return res.json({ success: true, message: 'Profile picture updated' });
    }

    return res.status(400).json({ error: 'Unsupported content-type' });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Server error uploading image' });
  }
});

// ─── Remove profile picture ───
app.post('/api/remove-pfp', async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });
    await pool.query('UPDATE users SET profile_picture = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1', [user_id]);
    res.json({ success: true, message: 'Profile picture removed' });
  } catch (error) {
    console.error('Remove pfp error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
