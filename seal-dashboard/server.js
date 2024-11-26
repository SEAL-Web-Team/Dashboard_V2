const express = require('express');
const session = require('express-session');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
require('dotenv').config(); //access .env

const app = express();
const port = 3000;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

// OAuth Stuff
const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets'
];

app.use(
  session({
    secret: 'your-secret-key', //change!
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } 
  })
);

app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  if (req.session.tokens) {
    let html = `<h1>Welcome to the Seal Dashboard App</h1>`;

    if (req.session.sheetId) {
      html += `
        <p>Your selected Google Sheet ID: ${req.session.sheetId}</p>
        <form action="/update-spreadsheet" method="POST">
          <button type="submit">Update Spreadsheet with Current Date and Time</button>
        </form>
        <p><a href="/sheets">Change Selected Sheet</a></p>
      `;
    } else {
      html += `
        <p>No Google Sheet selected.</p>
        <p><a href="/sheets">Select a Google Sheet</a> to start using the app.</p>
      `;
    }

    html += `<p><a href="/logout">Logout</a></p>`;
    res.send(html);
  } else {
    res.send(`
      <h1>Welcome to the Seal Dashboard App</h1>
      <p><a href="/login">Log in with Google</a> to start using the app.</p>
    `);
  }
});

app.get('/login', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.redirect(authUrl);
});

app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    req.session.tokens = tokens; 
    res.redirect('/');
  } catch (error) {
    console.error('Error retrieving tokens:', error);
    res.status(500).send('Authentication failed.');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/');
  });
});

app.get('/sheets', async (req, res) => {
  if (!req.session.tokens) {
    return res.status(401).send('Please log in first.');
  }

  const userClient = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  userClient.setCredentials(req.session.tokens);

  const drive = google.drive({ version: 'v3', auth: userClient });

  try {
    // list sheets
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      fields: 'files(id, name)',
      pageSize: 100
    });

    const sheets = response.data.files;

    let html = `
      <h1>Select a Google Sheet</h1>
      <form action="/select-sheet" method="POST">
        <select name="sheetId" required>
          <option value="" disabled selected>Select a sheet</option>
    `;

    sheets.forEach(sheet => {
      html += `<option value="${sheet.id}">${sheet.name}</option>`;
    });

    html += `
        </select>
        <button type="submit">Select Sheet</button>
      </form>
      <form action="/create-sheet" method="POST">
        <button type="submit">Create New Sheet</button>
      </form>
      <p><a href="/">Go back</a></p>
    `;

    res.send(html);
  } catch (error) {
    console.error('Error listing sheets:', error);
    res.status(500).send('Failed to retrieve sheets.');
  }
});

app.post('/select-sheet', async (req, res) => {
  const sheetId = req.body.sheetId;

  if (!sheetId) {
    return res.status(400).send('No sheet selected.');
  }

  req.session.sheetId = sheetId;

  res.redirect('/');
});

app.post('/create-sheet', async (req, res) => {
  if (!req.session.tokens) {
    return res.status(401).send('Please log in first.');
  }

  const userClient = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  userClient.setCredentials(req.session.tokens);

  try {
    const resource = {
      properties: {
        title: 'New Sheet from Seal Dashboard App'
      }
    };

    const sheet = await google.sheets({ version: 'v4', auth: userClient }).spreadsheets.create({
      resource,
      fields: 'spreadsheetId, properties(title)'
    });

    const sheetId = sheet.data.spreadsheetId;
    const sheetName = sheet.data.properties.title;

    req.session.sheetId = sheetId;

    res.redirect('/');
  } catch (error) {
    console.error('Error creating sheet:', error);
    res.status(500).send('Failed to create a new sheet.');
  }
});

app.post('/update-spreadsheet', async (req, res) => {
  if (!req.session.tokens) {
    return res.status(401).send('Please log in first.');
  }

  if (!req.session.sheetId) {
    return res.status(400).send('No Google Sheet selected.');
  }

  const userClient = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  userClient.setCredentials(req.session.tokens);

  const sheets = google.sheets({ version: 'v4', auth: userClient });

  try {
    const spreadsheetId = req.session.sheetId;
    const range = 'Sheet1!A:A';

    const now = new Date();
    const timestamp = now.toLocaleString(); 

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [[timestamp]]
      }
    });

    res.send(`
      <p>Spreadsheet updated successfully with timestamp: ${timestamp}</p>
      <p><a href="/">Go back</a></p>
    `);
  } catch (error) {
    console.error('Error updating spreadsheet:', error);
    res.status(500).send('Failed to update the spreadsheet.');
  }
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
