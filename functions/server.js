const pkg = require('pg');
const bcrypt = require('bcrypt');
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // Strip Netlify function prefix to get clean path
  const path = event.path
    .replace('/.netlify/functions/server', '')
    .replace('/api', '') || '/';

  try {
    /* ── LOGIN ── */
    if (path === '/login' && event.httpMethod === 'POST') {
      const { email, password } = JSON.parse(event.body || '{}');
      if (!email || !password) return json(400, { error: 'Email and password are required' });

      const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      if (!rows.length) return json(401, { error: 'Invalid email or password' });

      const user = rows[0];
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) return json(401, { error: 'Invalid email or password' });

      // Streak + XP
      const daysDiff = Math.floor((Date.now() - new Date(user.last_active)) / 86400000);
      const newStreak = daysDiff === 1 ? user.streak_days + 1 : daysDiff > 1 ? 1 : user.streak_days;
      const newXp = user.xp + 10;
      const newLevel = newXp >= user.level * 100 ? user.level + 1 : user.level;

      await pool.query(
        'UPDATE users SET last_active=CURRENT_DATE, streak_days=$1, xp=$2, level=$3, updated_at=CURRENT_TIMESTAMP WHERE user_id=$4',
        [newStreak, newXp, newLevel, user.user_id]
      );

      const [progress, achievements, notifications, settings, vocabulary] = await Promise.all([
        pool.query('SELECT * FROM user_progress WHERE user_id=$1', [user.user_id]),
        pool.query('SELECT * FROM achievements WHERE user_id=$1', [user.user_id]),
        pool.query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20', [user.user_id]),
        pool.query('SELECT * FROM user_settings WHERE user_id=$1', [user.user_id]),
        pool.query('SELECT * FROM vocabulary_progress WHERE user_id=$1', [user.user_id]),
      ]);

      return json(200, {
        success: true,
        user: { user_id: user.user_id, username: user.username, email: user.email, full_name: user.full_name, xp: newXp, level: newLevel, streak_days: newStreak, profile_picture: user.profile_picture, created_at: user.created_at },
        progress: progress.rows,
        achievements: achievements.rows,
        notifications: notifications.rows,
        settings: settings.rows[0] || null,
        vocabulary: vocabulary.rows
      });
    }

    /* ── SIGNUP ── */
    if (path === '/signup' && event.httpMethod === 'POST') {
      const { email, password, fullName, username } = JSON.parse(event.body || '{}');
      if (!email || !password || !fullName || !username) return json(400, { error: 'All fields are required' });

      const existing = await pool.query('SELECT user_id FROM users WHERE email=$1 OR username=$2', [email, username]);
      if (existing.rows.length) return json(400, { error: 'Email or username already exists' });

      const passwordHash = await bcrypt.hash(password, 10);
      const { rows } = await pool.query(
        'INSERT INTO users (username, email, password_hash, full_name, last_active) VALUES ($1,$2,$3,$4,CURRENT_DATE) RETURNING *',
        [username, email, passwordHash, fullName]
      );
      const user = rows[0];
      await pool.query('INSERT INTO user_settings (user_id) VALUES ($1)', [user.user_id]);

      return json(200, {
        success: true,
        user: { user_id: user.user_id, username: user.username, email: user.email, full_name: user.full_name, xp: 0, level: 1, streak_days: 0 }
      });
    }

    /* ── GET USER ── */
    const userMatch = path.match(/^\/user\/(.+)$/);
    if (userMatch && event.httpMethod === 'GET') {
      const userId = userMatch[1];
      const { rows } = await pool.query('SELECT * FROM users WHERE user_id=$1', [userId]);
      if (!rows.length) return json(404, { error: 'User not found' });

      const [progress, achievements, notifications, settings, vocabulary] = await Promise.all([
        pool.query('SELECT * FROM user_progress WHERE user_id=$1 ORDER BY completed_at DESC', [userId]),
        pool.query('SELECT * FROM achievements WHERE user_id=$1', [userId]),
        pool.query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20', [userId]),
        pool.query('SELECT * FROM user_settings WHERE user_id=$1', [userId]),
        pool.query('SELECT * FROM vocabulary_progress WHERE user_id=$1', [userId]),
      ]);

      return json(200, {
        user: rows[0],
        progress: progress.rows,
        achievements: achievements.rows,
        notifications: notifications.rows,
        settings: settings.rows[0] || null,
        vocabulary: vocabulary.rows
      });
    }

    return json(404, { error: 'Not found' });

  } catch (err) {
    console.error('Function error:', err);
    return json(500, { error: 'Server error', detail: err.message });
  }
};

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

    // Award login XP
    const newXp = user.xp + 10;
    let newLevel = user.level;
    if (newXp >= user.level * 100) {
      newLevel += 1;
    }

    // Update user
    await pool.query(
      `UPDATE users 
       SET last_active = CURRENT_DATE, streak_days = $1, xp = $2, level = $3, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $4`,
      [newStreak, newXp, newLevel, user.user_id]
    );

    // Return all user data
    res.json({
      success: true,
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        xp: newXp,
        level: newLevel,
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
      'SELECT * FROM user_progress WHERE user_id = $1',
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

    res.json({
      user,
      progress: progressResult.rows,
      achievements: achievementsResult.rows,
      notifications: notificationsResult.rows,
      settings: settingsResult.rows[0]
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error fetching user data' });
  }
});

// Export handler for Netlify Functions
module.exports.handler = async (event, context) => {
  // Add CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    // Parse the path to route to the correct handler
    const path = event.path.replace('/.netlify/functions/server', '');
    
    // Simple routing based on path and method
    if (path === '/api/login' && event.httpMethod === 'POST') {
      const reqBody = JSON.parse(event.body);
      // Re-run the login logic
      const { email, password } = reqBody;
      
      if (!email || !password) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Email and password are required' })
        };
      }

      const userResult = await pool.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );

      if (userResult.rows.length === 0) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Invalid email or password' })
        };
      }

      const user = userResult.rows[0];
      const passwordMatch = await bcrypt.compare(password, user.password_hash);

      if (!passwordMatch) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Invalid email or password' })
        };
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

      const newXp = user.xp + 10;
      let newLevel = user.level;
      if (newXp >= user.level * 100) {
        newLevel += 1;
      }

      await pool.query(
        `UPDATE users 
         SET last_active = CURRENT_DATE, streak_days = $1, xp = $2, level = $3, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $4`,
        [newStreak, newXp, newLevel, user.user_id]
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          user: {
            user_id: user.user_id,
            username: user.username,
            email: user.email,
            full_name: user.full_name,
            xp: newXp,
            level: newLevel,
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
        })
      };
    }

    if (path === '/api/signup' && event.httpMethod === 'POST') {
      const { email, password, fullName, username } = JSON.parse(event.body);
      
      if (!email || !password || !fullName || !username) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'All fields are required' })
        };
      }

      const existingUser = await pool.query(
        'SELECT * FROM users WHERE email = $1 OR username = $2',
        [email, username]
      );

      if (existingUser.rows.length > 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Email or username already exists' })
        };
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const result = await pool.query(
        `INSERT INTO users (username, email, password_hash, full_name, last_active)
         VALUES ($1, $2, $3, $4, CURRENT_DATE)
         RETURNING *`,
        [username, email, passwordHash, fullName]
      );

      const user = result.rows[0];

      await pool.query(
        `INSERT INTO user_settings (user_id)
         VALUES ($1)`,
        [user.user_id]
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Account created successfully',
          user: {
            user_id: user.user_id,
            username: user.username,
            email: user.email,
            full_name: user.full_name,
            xp: 0,
            level: 1,
            streak_days: 0
          }
        })
      };
    }

    if (path === '/api/user/:userId' && event.httpMethod === 'GET') {
      // Extract userId from path manually since we can't use express route params
      const userIdMatch = path.match(/^\/api\/user\/(.+)$/);
      if (!userIdMatch) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing user ID' }) };
      }
      const userId = decodeURIComponent(userIdMatch[1]);

      const userResult = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
      if (userResult.rows.length === 0) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'User not found' }) };
      }

      const user = userResult.rows[0];

      const [progressResult, achievementsResult, notificationsResult, settingsResult, vocabResult] = await Promise.all([
        pool.query('SELECT * FROM user_progress WHERE user_id = $1 ORDER BY completed_at DESC', [userId]),
        pool.query('SELECT * FROM achievements WHERE user_id = $1', [userId]),
        pool.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20', [userId]),
        pool.query('SELECT * FROM user_settings WHERE user_id = $1', [userId]),
        pool.query('SELECT * FROM vocabulary_progress WHERE user_id = $1', [userId]),
      ]);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          user,
          progress: progressResult.rows,
          achievements: achievementsResult.rows,
          notifications: notificationsResult.rows,
          settings: settingsResult.rows[0] || null,
          vocabulary: vocabResult.rows
        })
      };
    }

    if (path === '/api/courses' && event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      // Return static course catalog (courses table may not exist in all environments)
      const catalog = [
        { course_id: 1, title: 'Hello & Greetings',  description: 'Learn basic greetings like 你好, 再见, and 谢谢', level: 1, yct_level: 1, emoji: '👋', progress_pct: 0 },
        { course_id: 2, title: 'Numbers 1–10',        description: 'Master numbers from 一 to 十',               level: 1, yct_level: 1, emoji: '🔢', progress_pct: 0 },
        { course_id: 3, title: 'Family Members',      description: 'Meet your family: 爸爸, 妈妈, 哥哥, 姐姐',   level: 1, yct_level: 1, emoji: '👨‍👩‍👧', progress_pct: 0 },
        { course_id: 4, title: 'School Objects',      description: 'Learn school supplies: 书, 包, 铅笔, 橡皮', level: 1, yct_level: 1, emoji: '✏️', progress_pct: 0 },
        { course_id: 5, title: 'Colors and Sizes',    description: 'Describe things by color and size',         level: 2, yct_level: 2, emoji: '🎨', progress_pct: 0 },
        { course_id: 6, title: 'Time and Dates',       description: 'Talk about time, days, and dates',           level: 2, yct_level: 2, emoji: '🕐', progress_pct: 0 },
        { course_id: 7, title: 'Location and Places',  description: 'Ask for directions and name places',         level: 2, yct_level: 2, emoji: '🗺️', progress_pct: 0 },
        { course_id: 8, title: 'Food and Drink',       description: 'Order food and talk about your favorite dishes', level: 2, yct_level: 2, emoji: '🍜', progress_pct: 0 },
        { course_id: 9, title: 'Daily Routine',        description: 'Describe what you do every day',             level: 3, yct_level: 3, emoji: '🌅', progress_pct: 0 },
        { course_id: 10, title: 'Hobbies',             description: 'Talk about what you love to do in your free time', level: 3, yct_level: 3, emoji: '🎸', progress_pct: 0 },
        { course_id: 11, title: 'Shopping',            description: 'Go shopping and negotiate prices',           level: 3, yct_level: 3, emoji: '🛍️', progress_pct: 0 },
        { course_id: 12, title: 'Weather',             description: 'Talk about the weather and seasons',         level: 3, yct_level: 3, emoji: '⛅', progress_pct: 0 },
        { course_id: 13, title: 'Travel & Transport',  description: 'Plan a trip and talk about transportation',  level: 4, yct_level: 4, emoji: '✈️', progress_pct: 0 },
        { course_id: 14, title: 'Health & Body',       description: 'Describe your health and body parts',        level: 4, yct_level: 4, emoji: '🏃', progress_pct: 0 },
        { course_id: 15, title: 'Festivals & Culture', description: 'Learn about Chinese holidays and traditions', level: 4, yct_level: 4, emoji: '🏮', progress_pct: 0 },
        { course_id: 16, title: 'Story Time',          description: 'Read and understand short Chinese stories',   level: 4, yct_level: 4, emoji: '📚', progress_pct: 0 },
      ];

      // If student_id provided, try to enrich courses with per-user progress from DB
      const studentId = params.student_id || params.studentId;
      if (studentId) {
        try {
          const enrolledResult = await pool.query(
            `SELECT course_id, progress_pct, words_learned
             FROM user_courses
             WHERE user_id = $1`,
            [studentId]
          );
          const enrolledMap = new Map(enrolledResult.rows.map(r => [r.course_id, r]));
          const enriched = catalog.map(c => {
            const enrolled = enrolledMap.get(c.course_id);
            return { ...c, progress_pct: enrolled ? (enrolled.progress_pct || 0) : 0, words_learned: enrolled ? (enrolled.words_learned || 0) : 0 };
          });
          return { statusCode: 200, headers, body: JSON.stringify(enriched) };
        } catch {
          // user_courses table doesn't exist — return plain catalog
        }
      }

      return { statusCode: 200, headers, body: JSON.stringify(catalog) };
    }

    // Default response for unknown routes
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Not found' })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
