require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { neon } = require('@neondatabase/serverless');

// Cloudinary setup
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Validate Cloudinary config on startup
const cloudinaryConfigured = !!(
  process.env.CLOUDINARY_CLOUD_NAME && 
  process.env.CLOUDINARY_API_KEY && 
  process.env.CLOUDINARY_API_SECRET
);
console.log('Cloudinary configured:', cloudinaryConfigured);
if (!cloudinaryConfigured) {
  console.warn('⚠️  Cloudinary credentials missing - photo uploads will fail!');
}

// Use memory storage, then upload to Cloudinary
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  }
});

// Helper to upload buffer to Cloudinary
async function uploadToCloudinary(buffer, mimetype) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'wedding-guestbook',
        resource_type: 'image',
        transformation: [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto' }],
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

// Database connection
const sql = neon(process.env.DATABASE_URL);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ============ PUBLIC ENDPOINTS ============

// Error handler for multer
const handleUpload = (req, res, next) => {
  upload.array('photos', 5)(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 25MB.' });
      }
      return res.status(400).json({ error: 'File upload error: ' + err.message });
    }
    next();
  });
};

// Submit a new guestbook entry
app.post('/api/entries', handleUpload, async (req, res) => {
  try {
    const { name, note } = req.body;
    
    if (!name || !note) {
      return res.status(400).json({ error: 'Name and note are required' });
    }
    
    if (name.length > 120) {
      return res.status(400).json({ error: 'Name must be 120 characters or less' });
    }
    
    // Upload photos to Cloudinary
    const photos = [];
    if (req.files && req.files.length > 0) {
      console.log(`Processing ${req.files.length} file(s) for upload...`);
      
      if (!cloudinaryConfigured) {
        console.error('Cannot upload photos - Cloudinary not configured!');
      } else {
        for (const file of req.files) {
          try {
            console.log(`Uploading ${file.originalname} (${file.size} bytes)...`);
            const url = await uploadToCloudinary(file.buffer, file.mimetype);
            console.log(`Upload success: ${url}`);
            photos.push(url);
          } catch (uploadError) {
            console.error('Photo upload failed:', uploadError.message || uploadError);
          }
        }
      }
    }
    
    // Private messages are not approved (hidden from public)
    const isPrivate = req.body.private === 'true';
    const approved = !isPrivate;
    
    const result = await sql`
      INSERT INTO guestbook_entries (name, note, photos, approved)
      VALUES (${name}, ${note}, ${photos}, ${approved})
      RETURNING id, name, created_at
    `;
    
    const message = isPrivate 
      ? 'Thank you! Your private message has been sent to the couple.'
      : 'Thank you for signing the guestbook!';
    
    res.json({ 
      success: true, 
      message,
      entry: result[0]
    });
  } catch (error) {
    console.error('Error submitting entry:', error);
    res.status(500).json({ error: 'Failed to submit entry' });
  }
});

// Get approved entries (public)
app.get('/api/entries', async (req, res) => {
  try {
    const entries = await sql`
      SELECT id, name, note, photos, created_at
      FROM guestbook_entries
      WHERE approved = true
      ORDER BY created_at DESC
    `;
    res.json(entries);
  } catch (error) {
    console.error('Error fetching entries:', error);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

// ============ ADMIN ENDPOINTS ============

// Simple password middleware
const adminAuth = (req, res, next) => {
  const password = req.headers['x-admin-password'];
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Get all entries (admin)
app.get('/api/admin/entries', adminAuth, async (req, res) => {
  try {
    const entries = await sql`
      SELECT id, name, note, photos, created_at, approved
      FROM guestbook_entries
      ORDER BY created_at DESC
    `;
    res.json(entries);
  } catch (error) {
    console.error('Error fetching entries:', error);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

// Approve or reject an entry
app.patch('/api/admin/entries/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { approved } = req.body;
    
    if (typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'approved must be a boolean' });
    }
    
    const result = await sql`
      UPDATE guestbook_entries
      SET approved = ${approved}
      WHERE id = ${id}
      RETURNING id, name, approved
    `;
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    
    res.json({ success: true, entry: result[0] });
  } catch (error) {
    console.error('Error updating entry:', error);
    res.status(500).json({ error: 'Failed to update entry' });
  }
});

// Delete an entry
app.delete('/api/admin/entries/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await sql`
      DELETE FROM guestbook_entries
      WHERE id = ${id}
      RETURNING id
    `;
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    
    res.json({ success: true, message: 'Entry deleted' });
  } catch (error) {
    console.error('Error deleting entry:', error);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

// Serve frontend pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/display', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/display.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Wedding guestbook server running on port ${PORT}`);
});
