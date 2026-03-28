-- PostgreSQL — основное хранилище Degram
-- Timestamps: epoch ms (bigint) — как в API

CREATE TABLE IF NOT EXISTS users (
  wallet_address TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_color TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_handle ON users(handle);

CREATE TABLE IF NOT EXISTS auth_challenges (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  nonce TEXT NOT NULL,
  message TEXT NOT NULL,
  issued_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  used_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_wallet ON auth_challenges(wallet_address);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_expires ON auth_challenges(expires_at);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  issued_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_wallet ON sessions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  author_wallet_address TEXT NOT NULL REFERENCES users(wallet_address) ON DELETE RESTRICT,
  author_handle TEXT NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) <= 500),
  reply_to_post_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author_created ON posts(author_wallet_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_reply_to ON posts(reply_to_post_id);

CREATE TABLE IF NOT EXISTS follows (
  follower_wallet_address TEXT NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
  followee_wallet_address TEXT NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (follower_wallet_address, followee_wallet_address),
  CONSTRAINT follows_no_self CHECK (follower_wallet_address <> followee_wallet_address)
);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_wallet_address);
CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_wallet_address);

CREATE TABLE IF NOT EXISTS likes (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (post_id, wallet_address)
);
CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id);
CREATE INDEX IF NOT EXISTS idx_likes_wallet ON likes(wallet_address);
