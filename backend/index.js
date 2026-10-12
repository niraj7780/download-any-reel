const express = require('express');
const cors = require('cors');
const path = require('path');
const downloadsRouter = require('./routes/downloads');
const rateLimit = require('./middleware/rateLimit');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use('/api/downloads', rateLimit, downloadsRouter);

app.use('/storage', express.static(path.join(__dirname, 'storage')));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
