# Wedding Guestbook

A digital wedding guestbook with photo uploads and moderation, designed to be embedded in Squarespace websites.

## Features

- **Guest Form**: Visitors can sign the guestbook with their name, a message, and optional photos
- **Photo Uploads**: Support for up to 5 photos per entry, stored on Cloudinary
- **Moderation**: Admin page to approve/reject entries before they appear publicly
- **Responsive Design**: Clean, elegant design that works on all devices

## Pages

| URL | Description |
|-----|-------------|
| `/` | Guest form to sign the guestbook |
| `/display` | Public display of approved entries |
| `/admin` | Password-protected moderation panel |

## Setup

### 1. Prerequisites

- Node.js 18 or higher
- A [Neon](https://neon.tech) database (free tier available)
- A [Cloudinary](https://cloudinary.com) account (free tier available)

### 2. Environment Variables

Create a `.env` file in the project root (see `env-setup.txt` for your values):

```
DATABASE_URL=your_neon_connection_string
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
ADMIN_PASSWORD=your_secure_password
PORT=3000
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run the Server

```bash
npm start
```

The server will start at http://localhost:3000

## Embedding in Squarespace

Add a **Code Block** in Squarespace with this iframe:

```html
<iframe 
  src="https://your-replit-app.repl.co" 
  width="100%" 
  height="700" 
  frameborder="0"
  style="border: none; border-radius: 4px;">
</iframe>
```

For displaying entries, use a separate code block:

```html
<iframe 
  src="https://your-replit-app.repl.co/display" 
  width="100%" 
  height="800" 
  frameborder="0"
  style="border: none;">
</iframe>
```

## Deploying to Replit

1. Create a new Repl and select "Import from GitHub" or upload files
2. Add your environment variables in the Secrets tab
3. Click "Run" to start the server
4. Use the provided Replit URL for your Squarespace embeds

## Database Schema

The guestbook uses a single table:

```sql
CREATE TABLE guestbook_entries (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    note TEXT NOT NULL,
    photos TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved BOOLEAN DEFAULT FALSE
);
```

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/entries` | - | Submit a new entry |
| GET | `/api/entries` | - | Get approved entries |
| GET | `/api/admin/entries` | Yes | Get all entries |
| PATCH | `/api/admin/entries/:id` | Yes | Approve/reject entry |
| DELETE | `/api/admin/entries/:id` | Yes | Delete entry |

Admin endpoints require the `X-Admin-Password` header.
