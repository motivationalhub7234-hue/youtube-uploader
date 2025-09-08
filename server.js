const express = require("express");
const { google } = require("googleapis");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

// Your Client ID & Secret
const CLIENT_ID = "776410683982-t58c9iporv3h3coarssfm3asaqppipga.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
// Replace YOUR_RENDER_URL with your live Render URL after deploy
const REDIRECT_URI = "https://YOUR_RENDER_URL/oauth2callback";

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

let tokensByEmail = {};
let activeEmail = null;

function getYoutube(email) {
  if (!tokensByEmail[email]) throw new Error("No tokens for " + email);
  oauth2Client.setCredentials(tokensByEmail[email]);
  return google.youtube({ version: "v3", auth: oauth2Client });
}

function getDrive(email) {
  if (!tokensByEmail[email]) throw new Error("No tokens for " + email);
  oauth2Client.setCredentials(tokensByEmail[email]);
  return google.drive({ version: "v3", auth: oauth2Client });
}

// OAuth login
app.get("/auth", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube",
      "https://www.googleapis.com/auth/drive.readonly",
      "profile",
      "email"
    ]
  });
  res.redirect(url);
});

// OAuth callback
app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const me = await oauth2.userinfo.get();
  const email = me.data.email;

  tokensByEmail[email] = tokens;
  if (!activeEmail) activeEmail = email;

  res.send(`<script>window.close();</script>Logged in as ${email}`);
});

// Get accounts
app.get("/accounts", (req, res) => {
  res.json({ accounts: Object.keys(tokensByEmail), active: activeEmail });
});

// Set active account
app.post("/account/set", (req, res) => {
  activeEmail = req.body.email;
  res.json({ ok: true });
});

// Logout
app.post("/account/logout", (req, res) => {
  delete tokensByEmail[req.body.email];
  if (activeEmail === req.body.email) activeEmail = null;
  res.json({ ok: true });
});

// List Google Drive files
app.get("/drive/list", async (req, res) => {
  const email = req.query.email;
  try {
    const drive = getDrive(email);
    const files = await drive.files.list({
      pageSize: 10,
      fields: "files(id, name, mimeType, size)"
    });
    res.json({ files: files.data.files });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// Upload video to YouTube with geo-blocking
app.post("/upload", async (req, res) => {
  try {
    const { fileId, title, description, privacyStatus, blockedCountries, email } = req.body;
    const drive = getDrive(email);
    const youtube = getYoutube(email);

    const file = await drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });

    const video = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: { title, description },
        status: {
          privacyStatus,
          selfDeclaredMadeForKids: false,
          regionRestriction: { blocked: blockedCountries }
        }
      },
      media: { body: file.data }
    });

    res.json({ ok: true, videoId: video.data.id });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server live on port " + port));
