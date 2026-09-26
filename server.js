import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const desiredPort = Number(process.env.PORT || 3000);

app.use(express.json());
app.use('/lib', express.static(path.join(__dirname, 'lib')));

app.get('/api/config', (_req, res) => {
  res.json({
    appName: process.env.PUBLIC_APP_NAME || 'Agent Prism Mission',
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    hasSupabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, status: 'secure-channel-online' });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`Agent Prism mission site running on http://localhost:${port}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      const nextPort = port + 1;
      console.warn(`Port ${port} is already in use. Retrying on ${nextPort}.`);
      startServer(nextPort);
      return;
    }

    throw error;
  });
}

startServer(desiredPort);
