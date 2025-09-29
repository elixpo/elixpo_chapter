import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fetchGitHubData } from './github.js';
import { sendMail } from './mail.js';

dotenv.config();

const app = express();
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:3001',  
        'http://localhost',
        'https://me.elixpo.com',
        'https://www.me.elixpo.com',
        'https://elixpo.com'
    ]
}));
app.use(express.json());

app.post('/github', async (req, res) => {
    const { projectURL } = req.body;
    if (!projectURL) {
        return res.status(400).json({ error: 'projectURL is required' });
    }
    try {
        const data = await fetchGitHubData(projectURL);
        res.json(data);
    } catch (err) {
        console.error('Error fetching GitHub data:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/mail', async (req, res) => {
    const { name, email, message } = req.body;
    try {
        const result = await sendMail(name, email, message);
        res.json(result);
    } catch (err) {
        console.error('Error sending mail:', err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(3004, "localhost", () => {
    console.log('Server listening on port 3004');
});
