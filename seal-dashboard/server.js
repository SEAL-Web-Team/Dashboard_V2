const express = require('express');
const session = require('express-session');
const { google } = require('googleapis');
require('dotenv').config(); // Load environment variables from .env


const app = express();
const port = 3000;

// Replace with your Google Cloud project credentials
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

// Set up OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Define the scopes required for accessing Google Sheets
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Initialize express-session middleware for managing user sessions
app.use(
  session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true in production with HTTPS
  })
);

// Route for the root URL to provide instructions or a simple homepage
app.get('/', (req, res) => {
  res.send(`
    <h1>Welcome to the Seal Dashboard App</h1>
    <p><a href="/login">Log in with Google</a> to start using the app.</p>
  `);
});

// Route to initiate OAuth login
app.get('/login', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.redirect(authUrl);
});

// Route to handle OAuth2 callback
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    req.session.tokens = tokens; // Store tokens in the session for the user
    res.send('Authentication successful! You can now close this window and use the app.');
  } catch (error) {
    console.error('Error retrieving tokens:', error);
    res.status(500).send('Authentication failed.');
  }
});

// Route to update the Google Spreadsheet
app.get('/update-spreadsheet', async (req, res) => {
  if (!req.session.tokens) {
    return res.status(401).send('Please log in first.');
  }

  // Create a new OAuth2 client for each user session
  const userClient = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  userClient.setCredentials(req.session.tokens);

  // Initialize Google Sheets API client with user authentication
  const sheets = google.sheets({ version: 'v4', auth: userClient });

  try {
    const spreadsheetId = process.env.SHEET_ID; // Replace with actual spreadsheet ID
    const range = 'Sheet1!A1:B2'; // Define the range you want to update

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [
          ['Updated Value1', 'Updated Value2'],
          ['Updated Value3', 'Updated Value4']
        ]
      }
    });

    res.send('Spreadsheet updated successfully!');
  } catch (error) {
    console.error('Error updating spreadsheet:', error);
    res.status(500).send('Failed to update the spreadsheet.');
  }
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
