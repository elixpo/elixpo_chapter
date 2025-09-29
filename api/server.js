import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
dotenv.config();


const GITHUB_TOKEN = process.env.GITHUB_PAT;
// console.log(GITHUB_TOKEN)
async function fetchGitHubData(projectURL) {
    const [owner, repo] = projectURL.replace("https://github.com/", "").split("/");

    const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            Accept: "application/vnd.github+json"
        }
    });
    const repoData = await repoResponse.json();

    const contributorsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contributors`, {
        headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
        }
    });
    const contributors = await contributorsRes.json();

    return {
        name: repoData.name,
        description: repoData.description,
        stars: repoData.stargazers_count,
        topics: repoData.topics,
        owner: repoData.owner.login,
        contributors: contributors.slice(0, 10),
        url: repoData.html_url,
        ownerLogo: repoData.owner.avatar_url
    };
}

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
        res.status(500).json({ error: 'Failed to fetch GitHub data' });

    }
});



app.post('/mail', async (req, res) => {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
        return res.status(400).json({ error: 'Name, email, and message are required.' });
    }

    
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.MAIL_USER, 
            pass: process.env.MAIL_PASS  
        }
    });

    // HTML email template
    const html = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #f8f1de; padding: 32px; border-radius: 16px; max-width: 600px; margin: auto; box-shadow: 0 4px 24px #e2d9c8;">
            <h2 style="color: #1B1B19; text-align: center; margin-bottom: 24px;">📬 Dropped a Mail in your portfolio!</h2>
            <div style="background: #fffbe9; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                <p style="font-size: 1.1em; color: #222;"><strong>Name:</strong> ${name}</p>
                <p style="font-size: 1.1em; color: #222;"><strong>Email:</strong> <a href="mailto:${email}" style="color: #0077b5;">${email}</a></p>
                <hr style="margin: 18px 0; border: none; border-top: 1px solid #e2d9c8;">
                <p style="font-size: 1.15em; color: #1B1B19; white-space: pre-line;"><strong>Message:</strong><br>${message}</p>
            </div>
            <footer style="text-align: center; color: #888; font-size: 0.95em; margin-top: 18px;">
                <span style="color: #ffc300;">Elixpo Portfolio</span> &mdash; <span style="color: #1B1B19;">${new Date().toLocaleString()}</span>
            </footer>
        </div>
    `;

    try {
        await transporter.sendMail({
            from: `"Elixpo" <${process.env.MAIL_USER}>`,
            to: 'ayushbhatt633@gmail.com',
            subject: `Dropping By Message From Portfolio ${name}`,
            html
        });
        res.json({ success: true, message: 'Mail sent successfully!' });
    } catch (err) {
        console.error('Error sending mail:', err);
        res.status(500).json({ error: 'Failed to send mail.' });
    }
});

app.listen(3004, "localhost", () => {
    console.log('Server listening on port 3004');
});
