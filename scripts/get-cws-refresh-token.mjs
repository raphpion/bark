import http from 'node:http';
import readline from 'node:readline';

const PORT = 8989;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(query) {
  return new Promise((resolve) => rl.question(query, (ans) => resolve(ans.trim())));
}

async function main() {
  console.log('=== Chrome Web Store OAuth2 Refresh Token Generator ===\n');
  console.log('Prerequisites:');
  console.log('1. Go to Google Cloud Console (https://console.cloud.google.com).');
  console.log('2. Enable the "Chrome Web Store API".');
  console.log('3. In "OAuth consent screen", set Publishing status to External and add your Google account as a Test User.');
  console.log('4. In "Credentials", create an "OAuth 2.0 Client ID" with type "Web application" (or Desktop).');
  console.log(`5. Add "${REDIRECT_URI}" to Authorized redirect URIs.\n`);

  const clientId = await ask('Enter your Google Client ID: ');
  const clientSecret = await ask('Enter your Google Client Secret: ');

  if (!clientId || !clientSecret) {
    console.error('❌ Client ID and Client Secret are required.');
    rl.close();
    process.exit(1);
  }

  const authUrl = `https://accounts.google.com/o/oauth2/auth?response_type=code&client_id=${encodeURIComponent(
    clientId
  )}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(
    SCOPE
  )}&access_type=offline&prompt=consent`;

  console.log('\nStarting local server on port', PORT, 'to receive authorization code...');

  let server;
  const codePromise = new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          '<h2>Authentication successful! You can close this tab and return to your terminal.</h2>'
        );
        resolve(code);
      } else {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h2>Authentication error: ${error || 'Unknown error'}</h2>`);
      }
    });

    server.listen(PORT);
  });

  console.log('\n👉 Open the following URL in your browser to authorize access:\n');
  console.log(authUrl);
  console.log('\nWaiting for browser authorization...');

  const code = await codePromise;
  server.close();

  console.log('\nExchanging authorization code for refresh token...');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  const tokenData = await tokenRes.json();

  if (tokenData.error) {
    console.error('\n❌ Error retrieving token:', tokenData.error_description || tokenData.error);
    rl.close();
    process.exit(1);
  }

  if (!tokenData.refresh_token) {
    console.error(
      '\n❌ No refresh_token returned. Did you already authorize this app? You may need to revoke access in your Google Account security settings and retry to get a refresh_token.'
    );
    rl.close();
    process.exit(1);
  }

  console.log('\n🎉 Successfully obtained Refresh Token!\n');
  console.log('Add these 4 secrets to your GitHub repository (Settings > Secrets and variables > Actions):');
  console.log('--------------------------------------------------');
  console.log('CHROME_CLIENT_ID     :', clientId);
  console.log('CHROME_CLIENT_SECRET :', clientSecret);
  console.log('CHROME_REFRESH_TOKEN :', tokenData.refresh_token);
  console.log('CHROME_EXTENSION_ID  : (Your 32-character Chrome Web Store item ID)');
  console.log('--------------------------------------------------\n');

  rl.close();
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  rl.close();
  process.exit(1);
});
